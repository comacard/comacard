import type { Currency } from "@sorosense/vault-client";

/**
 * The stablecoin whose brand logo represents each currency bucket, plus CTC. CTC is Creditcoin's
 * native coin, and ETH, the collateral asset. Neither is a currency bucket, so neither has a
 * `Currency` mapping below: both are reachable only by passing `token` explicitly.
 */
export type TokenSym = "USDC" | "USDT" | "EURC" | "CETES" | "CTC" | "ETH";

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
    // eslint-disable-next-line @next/next/no-img-element -- tiny static icon; next/image is overkill and mishandles local SVG
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
