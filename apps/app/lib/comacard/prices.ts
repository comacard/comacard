/**
 * USD prices, for display only.
 *
 * **This is not the oracle and must never become it.** `lib/comacard/oracle.ts` reads prices from
 * contracts, and `collateralValueOf` on the credit line decides what a deposit is worth in credit.
 * Those numbers move limits. These move nothing: they exist so a figure can be read as money by
 * somebody who does not hold a view on what tCTC is worth. A price fetched over HTTP from a third
 * party has no business deciding how much anyone can borrow.
 *
 * That separation also explains a gap a reader will notice. The chain prices 1 tUSDC at 1 tCTC,
 * while the market prices USDC at a dollar and CTC at about ten cents. So a wallet showing $50 of
 * deposits against a $3.79 limit is not a bug: it is a testnet price table meeting a mainnet one.
 * The USD figure describes the asset, the tCTC figure describes the credit, and they are answers to
 * different questions.
 *
 * **Testnet tokens are priced as their mainnet counterparts.** tUSDC is not USDC and tCTC is not
 * CTC; neither has a market. Quoting the real asset is the only meaningful number available and it
 * is the same thing `oracle.ts` already does with Chainlink and the Uniswap pool. It is honest for
 * a demo and it is not collateral-grade pricing. Say it that way if anyone asks.
 */

/**
 * CoinGecko ids, and one of them is a trap.
 *
 * **Creditcoin is `creditcoin-2`, not `creditcoin`.** Both ids resolve and both return a number.
 * `creditcoin` answers $0.0253 with a `last_updated_at` of 1527071580, which is May 2018: it is a
 * dead listing that has not traded in eight years. `creditcoin-2` is the live one, symbol CTC,
 * market cap rank 411. Picking the obvious id puts every figure in the app out by a factor of four
 * with nothing to indicate it, which is the quiet-wrong-answer shape the root CLAUDE.md is about.
 */
export const COINGECKO_IDS = {
  CTC: "creditcoin-2",
  ETH: "ethereum",
  BNB: "binancecoin",
  AVAX: "avalanche-2",
  USDC: "usd-coin",
  USDT: "tether",
} as const;

export type PricedSymbol = keyof typeof COINGECKO_IDS;

/** USD per whole unit, keyed by the symbols above. Absent means "not read", never "worthless". */
export type UsdPrices = Partial<Record<PricedSymbol, number>>;

/**
 * The app's symbols, mapped onto the priced ones.
 *
 * The `t` prefix is ours, not the market's, and the Sepolia faucet tokens stand in for real assets.
 * Anything not listed here has no sensible USD quote and is left without one rather than guessed at.
 */
const ALIASES: Record<string, PricedSymbol> = {
  CTC: "CTC",
  tCTC: "CTC",
  ETH: "ETH",
  tETH: "ETH",
  WETH: "ETH",
  tWETH: "ETH",
  BNB: "BNB",
  tBNB: "BNB",
  AVAX: "AVAX",
  tAVAX: "AVAX",
  USDC: "USDC",
  tUSDC: "USDC",
  USDT: "USDT",
  tUSDT: "USDT",
};

export const pricedSymbol = (symbol: string): PricedSymbol | null => ALIASES[symbol] ?? null;

/** USD for a whole-unit amount, or null when that asset has no price read. */
export function usdOf(amount: number, symbol: string, prices: UsdPrices): number | null {
  const key = pricedSymbol(symbol);
  if (!key) return null;
  const price = prices[key];
  return price === undefined ? null : amount * price;
}

/**
 * USD as a person expects to see it, which is not always two decimals.
 *
 * Testnet holdings are small and a flat two-decimal format turns most of them into "$0.00", which
 * reads as nothing rather than as a little. Under a dollar it keeps enough digits to stay a number.
 */
export function formatUsd(value: number): string {
  const digits = value !== 0 && Math.abs(value) < 1 ? 4 : 2;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
