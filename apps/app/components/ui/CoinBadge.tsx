/* eslint-disable @next/next/no-img-element -- tiny static icons that must paint the moment
   they appear; next/image defers them, and one mishandles a local SVG. The biome-ignore
   comments below have to sit directly above each tag, so a second next-line directive
   cannot also be there, hence file scope. */

/**
 * Every symbol a screen can put a logo against. CTC is Creditcoin's own; ETH, BNB and AVAX are the
 * native coins of the chains collateral arrives from.
 */
export type TokenSym = "USDC" | "USDT" | "CTC" | "ETH" | "BNB" | "AVAX";

// Official token logos under /public/tokens (USDC → Circle SVG, USDT → Tether, CTC → Creditcoin's
// symbol, knocked out white on the brand black so it reads as a coin).
// Real brand assets, so this is the one deliberate exception to the monochrome palette (PM-approved).
const FILE: Record<TokenSym, string> = {
  USDC: "/tokens/usdc.svg",
  USDT: "/tokens/usdt.svg",
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
  return "CTC";
}

/**
 * Circular token logo. `object-cover` keeps non-circular source art inside the round badge.
 *
 * It used to take a `currency` prop as well, mapping USD, EUR and MXN onto the stablecoin that
 * funded each one. No screen passed it, the last two logos it reached are gone, and a prop with no
 * caller is a prop somebody will one day trust.
 */
export function CoinBadge({
  token,
  size = 40,
  className = "",
}: {
  token?: TokenSym;
  size?: number;
  className?: string;
}) {
  const key: TokenSym = token ?? "USDC";
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
