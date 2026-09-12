import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Every chain with a WormholeVault in config.yaml needs an entry in the
 * handler's chain map, and nothing enforced that.
 *
 * It went wrong exactly once and cost three chains: the map kept Base and
 * Arbitrum, three vaults were added to config.yaml, and the handler returned
 * quietly on the chains it did not recognise. Envio then reported all seven
 * chains 100% synced with their events processed, while three of them produced
 * no rows at all. Nothing anywhere said a deposit had been dropped.
 */
const config = readFileSync(new URL("../config.yaml", import.meta.url), "utf8");
const handler = readFileSync(new URL("../src/handlers/Wormhole.ts", import.meta.url), "utf8");

function chainsWithAVault(): number[] {
  const out: number[] = [];
  const blocks = config.split(/^ {2}- id: /m).slice(1);
  for (const block of blocks) {
    const id = Number(block.split("\n")[0]);
    if (block.includes("WormholeVault")) out.push(id);
  }
  return out;
}

function mappedChains(): number[] {
  const body = handler.split("const WORMHOLE_CHAIN_ID")[1]?.split("};")[0] ?? "";
  return [...body.matchAll(/^\s*(\d[\d_]*):/gm)].map((m) => Number(m[1]?.replaceAll("_", "")));
}

test("every vault chain in config.yaml is in the handler's map", () => {
  const configured = chainsWithAVault();
  expect(configured.length).toBeGreaterThan(0);
  for (const id of configured) {
    expect(mappedChains()).toContain(id);
  }
});

test("the map holds no chain that has no vault", () => {
  const configured = chainsWithAVault();
  for (const id of mappedChains()) {
    expect(configured).toContain(id);
  }
});
