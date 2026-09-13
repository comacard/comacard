import { COINGECKO_IDS, formatUsd, pricedSymbol, usdOf } from "../prices";

/**
 * The expensive mistake available here is picking the wrong CoinGecko id.
 *
 * `creditcoin` and `creditcoin-2` both resolve and both return a number. `creditcoin` answers about
 * $0.025 with a `last_updated_at` of May 2018: a dead listing that has not traded in eight years.
 * `creditcoin-2` is the live CTC. Take the obvious one and every figure in the app is out by a
 * factor of four, with nothing anywhere to indicate it.
 */

test("Creditcoin is creditcoin-2, the listing that still trades", () => {
  expect(COINGECKO_IDS.CTC).toBe("creditcoin-2");
  expect(COINGECKO_IDS.CTC).not.toBe("creditcoin");
});

test("every testnet symbol maps onto the asset it stands in for", () => {
  // The `t` prefix is ours. tUSDC is not USDC and has no market, so it is quoted as the real thing,
  // which is the same thing `oracle.ts` does with Chainlink. Honest for a demo, not collateral-grade.
  expect(pricedSymbol("tUSDC")).toBe("USDC");
  expect(pricedSymbol("tCTC")).toBe("CTC");
  expect(pricedSymbol("tWETH")).toBe("ETH");
  expect(pricedSymbol("BNB")).toBe("BNB");
  expect(pricedSymbol("AVAX")).toBe("AVAX");
});

test("an unknown symbol has no price rather than a guessed one", () => {
  expect(pricedSymbol("WIF")).toBeNull();
  expect(usdOf(100, "WIF", { CTC: 0.1 })).toBeNull();
});

test("a symbol with no price read is null, never zero", () => {
  // The distinction the whole app is built on: an unread figure is not a claim that something is
  // worthless. Callers render tCTC when this is null.
  expect(usdOf(50, "tUSDC", {})).toBeNull();
  expect(usdOf(50, "tUSDC", { USDC: 1 })).toBe(50);
});

test("small holdings keep enough digits to stay a number", () => {
  // Testnet balances are small. Flat two decimals turns most of them into "$0.00", which reads as
  // nothing rather than as a little.
  expect(formatUsd(0.6264)).toBe("$0.6264");
  expect(formatUsd(3.7921)).toBe("$3.79");
  expect(formatUsd(1000)).toBe("$1,000.00");
  expect(formatUsd(0)).toBe("$0.00");
});

test("a holding is priced per whole unit", () => {
  // 0.01 BNB at 725.97. Scaling by base units instead would value it at a billionth of its worth.
  expect(usdOf(0.01, "BNB", { BNB: 725.97 })).toBeCloseTo(7.2597, 4);
});

test("the id list has no duplicates and no blanks", () => {
  const ids = Object.values(COINGECKO_IDS);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
});
