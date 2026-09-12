/* eslint-disable @next/next/no-img-element -- tiny static icons that must paint the moment
   they appear; next/image defers them, and one mishandles a local SVG. The biome-ignore
   comments below have to sit directly above each tag, so a second next-line directive
   cannot also be there — hence file scope. */
/**
 * The chain a token lives on, as a small mark pinned to the token's own icon.
 *
 * A corner badge rather than a second icon in the row, because the chain is not a separate thing
 * being listed — it is half of the asset's identity. USDC on Base and USDC on Arbitrum are
 * different assets in different vaults, and two rows reading "USDC" with the same blue circle would
 * be indistinguishable in exactly the place where picking the wrong one costs money.
 *
 * An unknown chain renders nothing at all. A generic placeholder would suggest the app knows which
 * chain it is and has merely lost the picture.
 */

/**
 * Every mark here is the project's own, from Trust Wallet's asset registry, rather than drawn in
 * this file. A hand-approximated logo is simply a wrong logo: the first attempt gave Base a circle
 * with a notch cut out of it, when the real mark is a plain blue rounded square.
 */
const FILE: Record<string, string> = {
  ethereum: "/chains/ethereum.png",
  sepolia: "/chains/ethereum.png",
  base: "/chains/base.png",
  arbitrum: "/chains/arbitrum.png",
  optimism: "/chains/optimism.png",
  bnb: "/chains/bnb.png",
  avalanche: "/chains/avalanche.png",
  creditcoin: "/chains/creditcoin.png",
};

/** Matches on the leading word so "Base Sepolia" and "Arbitrum Sepolia" resolve to their own L2
 *  rather than to Ethereum, which a naive "contains sepolia" test would get backwards. */
export function chainLogo(chainName: string): string | null {
  const name = chainName.toLowerCase();
  if (name.startsWith("base")) return FILE.base as string;
  if (name.startsWith("arbitrum")) return FILE.arbitrum as string;
  if (name.startsWith("optimism")) return FILE.optimism as string;
  // "BSC Testnet" is what the chain map calls it and BNB is what the mark is of. Fuji is matched on
  // its own name rather than on "avalanche" alone, since the chain map spells it "Avalanche Fuji".
  if (name.startsWith("bsc") || name.startsWith("bnb")) return FILE.bnb as string;
  if (name.startsWith("avalanche") || name.includes("fuji")) return FILE.avalanche as string;
  if (name.includes("creditcoin")) return FILE.creditcoin as string;
  // Last, because every testnet above is also a "sepolia" and would match this first.
  if (name.includes("sepolia") || name.includes("ethereum")) return FILE.ethereum as string;
  return null;
}

export function ChainBadge({
  chainName,
  size = 16,
  className = "",
}: {
  chainName: string;
  size?: number;
  className?: string;
}) {
  const src = chainLogo(chainName);
  if (!src) return null;
  return (
    // biome-ignore lint/performance/noImgElement: static asset that must paint the moment the step appears; next/image defers it
    <img
      src={src}
      // Decorative: every row that shows this badge already names the chain in its text, and an
      // alt here lands in the row's accessible name twice over ("USDC Sepolia tUSDC Sepolia …").
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      // `rounded-full` would clip the corners off Base's square mark, so the rounding comes from
      // the artwork itself and this only draws the ring that lifts it off the token icon.
      className={`rounded-[28%] ring-2 ring-white ${className}`}
    />
  );
}

/** A token icon with its chain pinned to the bottom-right corner. */
export function AssetIcon({
  children,
  chainName,
  badgeSize = 16,
}: {
  children: React.ReactNode;
  chainName: string;
  badgeSize?: number;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      {children}
      <span className="absolute -bottom-0.5 -right-0.5 inline-flex">
        <ChainBadge chainName={chainName} size={badgeSize} />
      </span>
    </span>
  );
}
