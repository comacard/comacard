"use client";
import Link from "next/link";
import { formatUnits } from "viem";
import type { RemoteAsset } from "../../hooks/useRemoteCollateral";
import { NATIVE_SYMBOL } from "../../lib/comacard/contracts";
import { AssetIcon, badgeForSymbol, CoinBadge, Section } from "../ui";

/**
 * Collateral that is out of the vault's hands and into the borrower's, waiting on their signature.
 *
 * @FjrREPO's words for it in #8: *a nudge, not a spinner*. Between the relay approving a release and
 * the borrower claiming it, nothing is waiting on the protocol — the money is sitting in the vault
 * and the only thing left is a transaction the person has not sent. Without this the state is
 * invisible: the limit dropped when they asked, the withdraw screen would show the button, and
 * nothing on Home says to go there. Someone who closed the tab mid-flow has no way back except
 * remembering.
 *
 * **Read from the chain, not the indexer.** `releasable` is the vault's own `nativeReleasable` /
 * `tokenReleasable` for this wallet, which is what `unlockNative` actually checks. The indexer has
 * the same fact in `RemoteWithdrawal` and it has been wrong about it twice today — once because two
 * chains sync out of step and the stages were matched to the wrong row, once because a redeploy
 * dropped the older relays out of the config and their events with them. This is Fajar's own rule
 * back at him: the indexer for history, the chain for anything the user is about to act on.
 *
 * It renders nothing when there is nothing to claim, because a nudge that is always there is not a
 * nudge.
 */

const fmt = (value: bigint, decimals: number): string =>
  Number(formatUnits(value, decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });

export function ClaimableCollateral({
  assets,
  className = "",
}: {
  assets: RemoteAsset[];
  className?: string;
}) {
  const ready = assets.filter((asset) => asset.releasable > 0n);
  if (ready.length === 0) return null;

  return (
    <Section title="Ready to withdraw" className={className}>
      <div className="rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        {ready.map((asset, i) => {
          const symbol = asset.native ? (NATIVE_SYMBOL[asset.wormholeChainId] ?? "ETH") : "USDC";
          return (
            <Link
              key={asset.id}
              href={`/withdraw/x/${asset.id}`}
              className={`-mx-4 flex items-center gap-3 px-4 py-3.5 no-underline transition-colors hover:bg-[#f4f4f4] ${
                i === 0 ? "" : "border-t border-line"
              }`}
            >
              <AssetIcon chainName={asset.chainName} badgeSize={14}>
                <CoinBadge token={badgeForSymbol(symbol)} size={32} />
              </AssetIcon>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  {fmt(asset.releasable, asset.decimals)} {symbol}
                </div>
                {/* The whole point of the row: it is theirs already, and one signature away. */}
                <div className="mt-0.5 text-[11.5px] text-muted">
                  Waiting for you on {asset.chainName}
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
