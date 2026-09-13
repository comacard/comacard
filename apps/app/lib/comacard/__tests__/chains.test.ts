import { chainLogo } from "../../../components/ui/ChainBadge";
import { badgeForSymbol } from "../../../components/ui/CoinBadge";
import { NATIVE_SYMBOL, nativeAssetId, WORMHOLE_CHAIN_NAMES, WORMHOLE_VAULTS } from "../contracts";

/**
 * The three numbering systems that meet in this app do not agree, and two of the five Wormhole ids
 * do not follow the pattern the other three set.
 *
 * Wormhole gave its later testnets ids in the 10000s: Sepolia 10002, Arbitrum 10003, Base 10004,
 * Optimism 10005, but BSC Testnet and Avalanche Fuji predate that scheme and reuse their mainnet
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
  // An unknown chain deliberately renders no badge at all, so a missing logo is silent, the row
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
  // `native ? "ETH" : "USDC"`, so BSC's BNB and Fuji's AVAX were both announced as ETH, on the
  // screens that ask someone to part with them, and on the row that says what backs their limit.
  expect(NATIVE_SYMBOL[4]).toBe("BNB");
  expect(NATIVE_SYMBOL[6]).toBe("AVAX");
  expect(NATIVE_SYMBOL[10004]).toBe("ETH");
});

test("BNB and AVAX have their own marks rather than falling back to CTC", () => {
  // `badgeForSymbol` returns CTC for anything it does not know, so a missing entry does not break,
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

/**
 * Asset ids, pinned against the live hub.
 *
 * `assetId` is `keccak256(abi.encodePacked(chainId, token))`. With `abi.encode` instead, the uint16
 * is left-padded to a full word and every id comes out different, matching nothing on chain, so
 * every asset reads as unlisted and the whole cross-chain half of Home empties out. Nothing throws.
 *
 * These five were read off `listedAssets()` on the deployed hub
 * (0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f, Creditcoin CC3) on 13 September 2026, which is what
 * makes this a test rather than a restatement of the implementation.
 */
const LIVE_NATIVE_IDS: Record<number, string> = {
  4: "0x32cdb210881fded98093ddd313dbce19f612b2852920c975483e496c37327ba1",
  6: "0x779148837d697f373039dc6055ba9b62794c1f14a8fb48756922bcb991d891f0",
  10003: "0x68ec44ebd2f675a61ae83495f96d229c53ef4eb6f8d8bf0f5e8c1ce09249e71a",
  10004: "0xc6aa4e4fb533fd7554116f7dca41109d6a4dddfbe397eefc56f10843fdc544bb",
  10005: "0xca7ea440ca3a18040ca2ac7d4768afe40b36baf680afa7aac84426e936b00a62",
};

test("a native asset id is derived exactly as the live hub files it", () => {
  for (const [chain, id] of Object.entries(LIVE_NATIVE_IDS)) {
    expect(nativeAssetId(Number(chain))).toBe(id);
  }
});

test("every chain with a vault can have its native id derived without a log query", () => {
  // This is what keeps BNB off the nine-second log scan. If a vault is added and this list is not,
  // its native asset falls back to the scan and quietly gets slow again.
  for (const chain of Object.keys(WORMHOLE_VAULTS).map(Number)) {
    expect(LIVE_NATIVE_IDS[chain]).toBeDefined();
    expect(nativeAssetId(chain)).toBe(LIVE_NATIVE_IDS[chain]);
  }
});

test("ids are distinct per chain, which is the whole reason they are keyed this way", () => {
  // USDC on Base and USDC on Arbitrum share a name and a token address shape. Two chains colliding
  // here would merge two balances into one row.
  const ids = Object.keys(LIVE_NATIVE_IDS).map((c) => nativeAssetId(Number(c)));
  expect(new Set(ids).size).toBe(ids.length);
});
