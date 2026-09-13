"use client";
import Link from "next/link";
import { formatUnits } from "viem";
import type { CollateralAsset } from "../../hooks/useCollateral";
import type { RemoteAsset } from "../../hooks/useRemoteCollateral";
import { NATIVE_SYMBOL } from "../../lib/comacard/contracts";
import { AssetIcon, badgeForSymbol, CoinBadge, Section } from "../ui";
import type { TokenSym } from "../ui/CoinBadge";

/**
 * What is backing the limit, one row per asset.
 *
 * The column that matters is **proved**, not locked. Collateral sitting in the Sepolia vault raises
 * nothing until Attestcoin has carried it across, which takes seven to nine minutes. During that
 * window the two numbers genuinely disagree, and a row that showed only the locked amount would be
 * claiming credit the chain has not granted yet. So a crossing asset says so, in words.
 *
 * Assets with nothing in them are dropped rather than listed at zero: three empty stablecoin rows
 * tell the holder nothing except that the screen has rows.
 *
 * Cross-chain deposits are listed beside the Sepolia ones because the limit is built from both.
 * They carry their chain's name, and that is not decoration: USDC on Base and USDC on Arbitrum are
 * different assets in different vaults, so two rows reading "USDC" with no chain would be
 * indistinguishable and wrong.
 */
const BADGE: Record<string, TokenSym> = { ETH: "ETH", tWETH: "ETH", tUSDC: "USDC", tUSDT: "USDC" };

function amount(value: bigint, decimals: number, symbol: string): string {
  const n = Number(formatUnits(value, decimals));
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol}`;
}

/** Credit-asset value of a holding: price is per WHOLE unit, so scale by the token's own decimals. */
function valueCtc(asset: CollateralAsset, held: bigint): string {
  const whole = Number(formatUnits(held, asset.decimals));
  const price = Number(formatUnits(asset.price, 18));
  return (whole * price).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function CollateralList({
  assets,
  remote = [],
  className = "mt-4",
}: {
  assets: CollateralAsset[];
  remote?: RemoteAsset[];
  className?: string;
}) {
  const held = assets.filter((a) => a.locked > 0n || a.proved > 0n);
  const heldRemote = remote.filter((a) => a.credited > 0n);
  if (held.length === 0 && heldRemote.length === 0) return null;

  return (
    <Section title="Backing your limit" className={className}>
      <div className="rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        {held.map((asset, i) => (
          <div
            key={asset.token ?? "native"}
            className={`flex items-center gap-3 py-3.5 ${i === 0 ? "" : "border-t border-line"}`}
          >
            <AssetIcon chainName="Sepolia" badgeSize={14}>
              <CoinBadge token={BADGE[asset.symbol] ?? "CTC"} size={32} />
            </AssetIcon>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">{asset.symbol}</div>
              {asset.crossing && (
                <div className="mt-0.5 text-[11.5px] text-warn">
                  {amount(asset.locked - asset.proved, asset.decimals, asset.symbol)} still crossing
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[14px] font-semibold tabular-nums">
                {amount(asset.proved, asset.decimals, asset.symbol)}
              </div>
              <div className="text-[11.5px] text-muted tabular-nums">
                {valueCtc(asset, asset.proved)} tCTC
              </div>
            </div>
          </div>
        ))}

        {heldRemote.map((asset, i) => {
          const symbol = asset.native ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH") : "USDC";
          return (
            <Link
              key={asset.id}
              href={`/withdraw/x/${asset.id}`}
              className={`-mx-4 flex items-center gap-3 px-4 py-3.5 no-underline transition-colors hover:bg-[#f4f4f4] ${
                i === 0 && held.length === 0 ? "" : "border-t border-line"
              }`}
            >
              <AssetIcon chainName={asset.chainName} badgeSize={14}>
                <CoinBadge token={badgeForSymbol(symbol)} size={32} />
              </AssetIcon>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{symbol}</div>
                <div className="mt-0.5 text-[11.5px] text-muted">{asset.chainName}</div>
              </div>
              <div className="text-right">
                <div className="text-[14px] font-semibold tabular-nums">
                  {amount(asset.credited, asset.decimals, symbol)}
                </div>
                <div className="text-[11.5px] text-muted tabular-nums">
                  {remoteValueCtc(asset)} tCTC
                </div>
              </div>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                className="shrink-0 text-faint"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}

/** Same per-whole-unit pricing as a Sepolia token, against the asset's own decimals. */
function remoteValueCtc(asset: RemoteAsset): string {
  const whole = Number(formatUnits(asset.credited, asset.decimals));
  const price = Number(formatUnits(asset.price, 18));
  return (whole * price).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}
