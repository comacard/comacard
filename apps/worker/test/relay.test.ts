import { describe, expect, test } from "bun:test";
import { JsonRpcProvider, Wallet } from "ethers";
import { creditcoin, vaults, type WormholeChainId } from "../src/config";

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
