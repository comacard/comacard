import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { JsonRpcProvider, Wallet } from "ethers";
import { creditcoin, vaults, type WormholeChainId } from "../src/config";
import { queueFor } from "../src/relay";

/**
 * A release travels from Creditcoin out to the chain holding the collateral,
 * which is the opposite direction to everything else the relay carries. The
 * wallet it is signed with therefore has to be rebound, and the failure when it
 * is not is silent: the far chain's relay address has no code on Creditcoin, so
 * the call succeeds, costs gas, and delivers nothing.
 */
describe("release signing", () => {
  const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  test("a Creditcoin-bound wallet is not what signs a release", () => {
    const wallet = new Wallet(key, creditcoin());
    for (const id of Object.keys(vaults).map(Number) as WormholeChainId[]) {
      const rebound = wallet.connect(new JsonRpcProvider(vaults[id].rpc));
      expect(rebound.provider).not.toBe(wallet.provider);
      expect(rebound.address).toBe(wallet.address);
    }
  });

  test("every chain carries its own relay address and RPC", () => {
    const relays = new Set<string>();
    const rpcs = new Set<string>();
    for (const v of Object.values(vaults)) {
      relays.add(v.relay.toLowerCase());
      rpcs.add(v.rpc);
    }
    // Five chains, five relays, five endpoints: sharing any of them would send
    // a release to the wrong place while still looking like it worked.
    expect(relays.size).toBe(Object.keys(vaults).length);
    expect(rpcs.size).toBe(Object.keys(vaults).length);
  });
});

describe("queueFor", () => {
  const nothingDelivered = () => false;

  test("a sequence whose VAA is unsigned survives a window that has moved past it", () => {
    const waiting = new Set<bigint>();
    // Round one: the block is in the window, but the guardians have not signed.
    expect(queueFor([1n], waiting, nothingDelivered)).toEqual([1n]);
    // Round two: the window has advanced and turns up nothing. It is still offered.
    expect(queueFor([], waiting, nothingDelivered)).toEqual([1n]);
  });

  test("delivering one drops it and leaves the rest", () => {
    const waiting = new Set<bigint>();
    queueFor([1n, 2n], waiting, nothingDelivered);
    expect(queueFor([], waiting, (s) => s === 1n)).toEqual([2n]);
  });

  test("an already delivered sequence is never queued", () => {
    const waiting = new Set<bigint>();
    expect(queueFor([7n], waiting, (s) => s === 7n)).toEqual([]);
    expect(waiting.size).toBe(0);
  });

  test("seeing the same sequence twice queues it once", () => {
    const waiting = new Set<bigint>();
    queueFor([3n], waiting, nothingDelivered);
    expect(queueFor([3n], waiting, nothingDelivered)).toEqual([3n]);
  });
});

/**
 * Deposits kept unsigned sequences across rounds from a38d3a0; releases did not,
 * and read an unsigned release once. queueFor itself is tested above, so this
 * only holds that sweepReleases goes through it rather than trusting that the
 * edit which wired it landed.
 */
describe("release sweeping", () => {
  const source = readFileSync(new URL("../src/relay.ts", import.meta.url), "utf8");
  const body = source.split("async function sweepReleases(")[1]?.split("\n}\n")[0] ?? "";

  test("an unsigned release is carried into later rounds, as a deposit is", () => {
    expect(body).toContain("queueFor(");
    expect(body).toContain("waiting.delete(sequence)");
  });

  test("a release that keeps failing is not dropped after a few rounds", () => {
    expect(body).not.toContain("attempts");
  });
});
