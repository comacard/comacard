import type { WalletAsset } from "../../hooks/useWalletAssets";
import { toNumber } from "../../hooks/useWalletAssets";
import { CoinBadge } from "../ui";

/**
 * One wallet balance, in the same shape as the bucket rows it replaced: logo, name, a chip naming
 * the chain, and the figures right-aligned. The markup deliberately mirrors `BucketRow` so the card
 * looks identical; only the content is different, because a balance is not a yield position.
 *
 * The second line is the USD value, not an APY, and so it is muted rather than green. Green in this
 * app means a gain, and holding a token is not one.
 *
 * No chain chip. Which testnet a balance sits on is not something the holder of the card needs to
 * read every time they open the app; `asset.network` is still carried for screens that do.
 */
const amountText = (asset: WalletAsset): string => {
  const n = toNumber(asset.amount, asset.decimals);
  // Four decimals for anything small enough that two would round it to nothing.
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${asset.symbol}`;
};

const usdText = (usd: number | null): string =>
  usd === null
    ? "price unavailable"
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AssetRow({ asset, first }: { asset: WalletAsset; first: boolean }) {
  return (
    <div className={`flex items-center gap-[13px] py-3.5 ${first ? "" : "border-t border-line"}`}>
      <CoinBadge token={asset.token} size={40} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{asset.name}</div>
      </div>
      <div className="text-right">
        <div className="font-semibold [font-variant-numeric:tabular-nums]">{amountText(asset)}</div>
        <div className="text-xs font-medium text-muted [font-variant-numeric:tabular-nums]">
          {usdText(asset.usd)}
        </div>
      </div>
    </div>
  );
}
