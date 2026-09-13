/* eslint-disable @next/next/no-img-element -- tiny static icons that must paint the moment
   they appear; next/image defers them, and one mishandles a local SVG. The biome-ignore
   comments below have to sit directly above each tag, so a second next-line directive
   cannot also be there — hence file scope. */

/**
 * The stablecoin whose brand logo represents each currency bucket, plus the native coins. CTC is
 * Creditcoin's own; ETH, BNB and AVAX are the collateral assets of the chains collateral arrives from. Neither is a currency bucket, so neither has a
 * `Currency` mapping below: both are reachable only by passing `token` explicitly.
 */
export type TokenSym = "USDC" | "USDT" | "EURC" | "CETES" | "CTC" | "ETH" | "BNB" | "AVAX";

/** The three fiat codes the Stellar port shipped with. Declared here rather than imported from the
 *  vault client: it is three string literals, and importing them was the last thing tying a live UI
 *  component to that package. Only `currency` callers reach this map, and none remain in Comacard. */
type Currency = "USD" | "EUR" | "MXN";
const CURRENCY_TOKEN: Record<Currency, TokenSym> = { USD: "USDC", EUR: "EURC", MXN: "CETES" };

// Official token logos under /public/tokens (USDC → Circle SVG, USDT → Tether, EURC → Circle,
// CETES → Etherfuse, CTC → Creditcoin's symbol, knocked out white on the brand black so it reads as
// a coin).
// Real brand assets, so this is the one deliberate exception to the monochrome palette (PM-approved).
const FILE: Record<TokenSym, string> = {
  USDC: "/tokens/usdc.svg",
  USDT: "/tokens/usdt.svg",
  EURC: "/tokens/eurc.png",
  CETES: "/tokens/cetes.png",
  CTC: "/tokens/ctc.png",
  ETH: "/tokens/eth.svg",
  // Not every chain pays in ether. BSC's native coin is BNB and Fuji's is AVAX, and falling back to
  // the CTC mark for them put Creditcoin's logo on someone else's money.
  BNB: "/tokens/bnb.png",
  AVAX: "/tokens/avax.png",
};

/**
 * The badge for a collateral asset's on-chain symbol.
 *
 * The Sepolia collateral tokens are faucet stand-ins, so their symbols carry a `t` prefix (`tUSDC`,
 * `tWETH`) that no logo file is named after. Mapping happens here, once, rather than in each screen
 * that lists collateral. An unknown symbol falls back to CTC rather than rendering a broken image.
 */
export function badgeForSymbol(symbol: string): TokenSym {
  const bare = symbol.replace(/^t/, "").toUpperCase();
  if (bare === "WETH" || bare === "ETH") return "ETH";
  if (bare === "BNB") return "BNB";
  if (bare === "AVAX") return "AVAX";
  if (bare === "USDC") return "USDC";
  if (bare === "USDT") return "USDT";
  if (bare === "EURC") return "EURC";
  if (bare === "CETES") return "CETES";
  return "CTC";
}

/**
 * Circular token logo. Pass a `token` (USDC/EURC/CETES/CTC/ETH) or a `currency` (USD/EUR/MXN); the currency
 * maps to its funding stablecoin's logo. `object-cover` keeps non-circular source art (CETES) inside
 * the round badge.
 */
export function CoinBadge({
  currency,
  token,
  size = 40,
  className = "",
}: {
  currency?: Currency;
  token?: TokenSym;
  size?: number;
  className?: string;
}) {
  const key: TokenSym = token ?? (currency ? CURRENCY_TOKEN[currency] : "USDC");
  return (
    // biome-ignore lint/performance/noImgElement: static asset that must paint the moment the step appears; next/image defers it
    <img
      src={FILE[key]}
      alt={key}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}
