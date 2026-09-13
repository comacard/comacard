import { chainLogo } from "../../../components/ui/ChainBadge";
import { badgeForSymbol } from "../../../components/ui/CoinBadge";
import { NATIVE_SYMBOL, WORMHOLE_CHAIN_NAMES, WORMHOLE_VAULTS } from "../contracts";

/**
 * The three numbering systems that meet in this app do not agree, and two of the five Wormhole ids
 * do not follow the pattern the other three set.
 *
 * Wormhole gave its later testnets ids in the 10000s — Sepolia 10002, Arbitrum 10003, Base 10004,
 * Optimism 10005 — but BSC Testnet and Avalanche Fuji predate that scheme and reuse their mainnet
 * numbers, 4 and 6. This file had Fuji at 10006, which is what extrapolating the sequence gives and
 * which is Holesky: a different chain, whose vault would have been read at the wrong address on a
 * screen that tells someone where their collateral is. The numbers are pinned here against the ones
 * `apps/worker/src/config.ts` and the indexer's chain map use.
 */

test("Fuji and BSC keep their mainnet ids rather than following the 10000 sequence", () => {
  expect(WORMHOLE_CHAIN_NAMES[4]).toBe("BSC Testnet");
  expect(WORMHOLE_CHAIN_NAMES[6]).toBe("Avalanche Fuji");
  // 10006 is Holesky. Nothing in this product deposits from it, so naming it Fuji was simply wrong.
  expect(WORMHOLE_CHAIN_NAMES[10006]).toBeUndefined();
});

test("every vault has a name", () => {
  // One direction only. A vault with no name renders as "Chain 4", which tells a depositor nothing
  // about where their money is. The reverse is legitimate: Sepolia is named because the hub reports
  // it, but its collateral crosses by Attestcoin and there is no Wormhole vault on it.
  for (const id of Object.keys(WORMHOLE_VAULTS)) {
    expect(WORMHOLE_CHAIN_NAMES[Number(id)], id).toBeDefined();
  }
  expect(WORMHOLE_CHAIN_NAMES[10002]).toBe("Sepolia");
  expect(WORMHOLE_VAULTS[10002]).toBeUndefined();
});

test("every chain the app can name has a mark", () => {
  // An unknown chain deliberately renders no badge at all, so a missing logo is silent — the row
  // just loses its corner mark and nothing says why.
  for (const name of Object.values(WORMHOLE_CHAIN_NAMES)) {
    expect(chainLogo(name), name).not.toBeNull();
  }
  expect(chainLogo("Creditcoin")).toContain("creditcoin");
});

test("an L2 resolves to its own mark, never to Ethereum's", () => {
  // Every one of these is also a "sepolia", so an order that tested Ethereum first would badge all
  // four with the Ethereum diamond.
  expect(chainLogo("Base Sepolia")).toContain("base");
  expect(chainLogo("Arbitrum Sepolia")).toContain("arbitrum");
  expect(chainLogo("Optimism Sepolia")).toContain("optimism");
  expect(chainLogo("Sepolia")).toContain("ethereum");
});

test("the native coin is the chain's own, never ETH by default", () => {
  // The deposit picker, the collateral list and both lock screens read this. They used to write
  // `native ? "ETH" : "USDC"`, so BSC's BNB and Fuji's AVAX were both announced as ETH — on the
  // screens that ask someone to part with them, and on the row that says what backs their limit.
  expect(NATIVE_SYMBOL[4]).toBe("BNB");
  expect(NATIVE_SYMBOL[6]).toBe("AVAX");
  expect(NATIVE_SYMBOL[10004]).toBe("ETH");
});

test("BNB and AVAX have their own marks rather than falling back to CTC", () => {
  // `badgeForSymbol` returns CTC for anything it does not know, so a missing entry does not break —
  // it puts Creditcoin's logo on someone else's money, which is worse than a broken image.
  expect(badgeForSymbol("BNB")).toBe("BNB");
  expect(badgeForSymbol("AVAX")).toBe("AVAX");
  expect(badgeForSymbol("WOMBAT")).toBe("CTC");
});

test("every native coin the hub lists can be named and badged", () => {
  for (const [id, name] of Object.entries(NATIVE_SYMBOL)) {
    expect(badgeForSymbol(name), `${id} → ${name}`).not.toBe("CTC");
  }
});
