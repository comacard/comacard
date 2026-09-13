import { NATIVE_SYMBOL, WORMHOLE_CHAIN_NAMES, WORMHOLE_VAULTS } from "../contracts";
import { DEPOSIT_CHAINS, FAUCET_CHAINS, FAUCETS } from "../faucets";

/**
 * A sixth list of chains is exactly how this project has produced bugs before.
 *
 * The root CLAUDE.md records five in one day, every one a plural treated as a singular, and three
 * of them were a chain list that held some of the chains. A faucet table that quietly covers four
 * of six networks fails the same way: no error, just a tab that offers nothing and a person who
 * concludes the chain is unsupported.
 *
 * So these read both lists and assert they agree in both directions, which is the countermeasure
 * that has actually worked here.
 */

test("every chain with a vault has a faucet, and every faucet has a chain", () => {
  const withVault = Object.keys(WORMHOLE_VAULTS).map(Number);
  const withFaucet = FAUCETS.map((f) => f.wormholeChainId);

  // Sepolia's deposits travel by Attestcoin, so it has a faucet and no Wormhole vault. Every OTHER
  // faucet must correspond to a vault, and every vault must have a faucet.
  for (const chain of withVault) expect(withFaucet).toContain(chain);
  for (const chain of withFaucet) {
    if (chain === 10002) continue;
    expect(withVault).toContain(chain);
  }
  expect(withFaucet).toContain(10002);
});

test("each faucet names its chain and coin from the tables the rest of the app reads", () => {
  // Not a copy of the strings. A faucet row that said "ETH on BSC Testnet" would be wrong about the
  // asset on the screen that sends someone to go and get it, which is the bug NATIVE_SYMBOL exists
  // to prevent and which shipped once already on the deposit screen.
  for (const faucet of FAUCETS) {
    expect(faucet.chainName).toBe(WORMHOLE_CHAIN_NAMES[faucet.wormholeChainId]);
    expect(faucet.symbol).toBe(NATIVE_SYMBOL[faucet.wormholeChainId]);
  }
});

test("BSC pays in BNB and Fuji in AVAX", () => {
  // Pinned by name because these are the two chains the demo actually uses, and the two whose ids
  // break the 10000-block pattern.
  const bsc = FAUCETS.find((f) => f.wormholeChainId === 4);
  const fuji = FAUCETS.find((f) => f.wormholeChainId === 6);

  expect(bsc?.symbol).toBe("BNB");
  expect(fuji?.symbol).toBe("AVAX");
});

test("no faucet is listed twice, and the tab order has no gaps", () => {
  expect(new Set(FAUCET_CHAINS).size).toBe(FAUCET_CHAINS.length);
  expect(FAUCET_CHAINS).toEqual(FAUCETS.map((f) => f.wormholeChainId));
});

test("every faucet points at an https page", () => {
  // A faucet link is followed out of the app during a demo. Not a liveness check, which a unit test
  // cannot do: just the shape, so a placeholder or a relative path cannot reach a build.
  for (const faucet of FAUCETS) {
    expect(faucet.href).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//);
    expect(faucet.host).not.toBe("");
  }
});

test("deposits are offered from every chain that has a vault, plus Sepolia", () => {
  expect(new Set(DEPOSIT_CHAINS)).toEqual(
    new Set([10002, ...Object.keys(WORMHOLE_VAULTS).map(Number)]),
  );
  expect(new Set(DEPOSIT_CHAINS).size).toBe(DEPOSIT_CHAINS.length);
});
