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

/** A vault with no relay beside it can take deposits and never give them back. */
function chainsWithARelay(): number[] {
  const out: number[] = [];
  for (const block of config.split(/^ {2}- id: /m).slice(1)) {
    const id = Number(block.split("\n")[0]);
    if (block.includes("ReleaseRelay")) out.push(id);
  }
  return out;
}

test("every vault chain also has a release relay", () => {
  expect(chainsWithARelay().sort()).toEqual(chainsWithAVault().sort());
});

/**
 * A relay that was replaced still emitted the releases it handled. Dropping it
 * from the config does not remove those events from the chain — it removes them
 * from the index, and the withdrawals they completed go back to reading "in
 * flight". That is a wrong answer about money rather than a missing one.
 *
 * Three generations have shipped today, so the live address alone is never the
 * whole story.
 */
test("each chain lists more than one relay generation", () => {
  for (const block of config.split(/^ {2}- id: /m).slice(1)) {
    const relay = block.split("- name: ReleaseRelay")[1];
    if (!relay) continue;
    const addresses = [...relay.matchAll(/^\s+- (0x[0-9a-fA-F]{40})$/gm)];
    expect(addresses.length).toBeGreaterThan(1);
  }
});
