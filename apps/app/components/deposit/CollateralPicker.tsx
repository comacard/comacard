"use client";
import { formatUnits } from "viem";
import { AssetIcon, badgeForSymbol, Card, CoinBadge, Skeleton } from "../ui";
import { SubHeader } from "../ui/SubHeader";
import { useCollateral, type CollateralAsset } from "../../hooks/useCollateral";
import { useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useNav } from "../../hooks/useNav";

/**
 * What a Comacard deposit actually is, and the screen that says so.
 *
 * Nothing is deposited *into* the card. Collateral is locked in `SourceVault` on Sepolia, it stays
 * on Sepolia, and Attestcoin proves the lock to Creditcoin, which raises the limit the card spends
 * against. The distinction is the product, so the copy says "lock", never "top up": a holder who
 * thinks they have moved money onto a card will not understand why the balance did not move.
 *
 * The asset list is read from `listedTokens()` on the credit line, never hardcoded. Listing a token
 * is a governance call, so the chain is the only source that cannot go stale, and a token listed
 * after this ships appears here without a deploy.
 *
 * Zero-balance rows stay tappable on purpose. Every listed token here is a faucet token, so an
 * empty balance is one mint away rather than a dead end, and hiding the row would hide the mint.
 *
 * The screen carries no explanation of any of that. The list is self-evident, and the attestation
 * wait belongs on the screen where someone is actually waiting for it, not in front of a person
 * who has not chosen an asset yet.
 */

function balanceLabel(asset: CollateralAsset): string {
  const n = Number(formatUnits(asset.available, asset.decimals));
  if (n === 0) return `0 ${asset.symbol}`;
  const digits = n < 1 ? 6 : 2;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: digits })} ${asset.symbol}`;
}

export function CollateralPicker() {
  const nav = useNav();
  const { assets, loading, error } = useCollateral();
  // Chains Attestcoin cannot reach, which arrive by Wormhole instead. Listed beside the Sepolia
  // assets because a deposit from either raises the same limit.
  const { assets: remote, loading: remoteLoading } = useRemoteCollateral();

  return (
    <div className="stagger">
      <SubHeader title="Deposit" />
      <Card className="px-5 py-1">
        {loading ? (
          <div className="py-4">
            <Skeleton className="h-10 w-full rounded-[14px]" />
            <Skeleton className="mt-3 h-10 w-full rounded-[14px]" />
          </div>
        ) : error || assets.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">
            {error
              ? "Could not read the accepted assets from the chain."
              : "No assets are listed as collateral yet."}
          </p>
        ) : (
          assets.map((asset, i) => (
            <button
              key={asset.token ?? "native"}
              type="button"
              onClick={() => nav.forward(`/deposit/${asset.slug}`)}
              className={`relative flex w-full items-center gap-[13px] py-3.5 text-left transition-colors hover:bg-[#f4f4f4] ${
                i === 0 ? "" : "border-t border-line"
              }`}
            >
              <AssetIcon chainName="Sepolia">
                <CoinBadge token={badgeForSymbol(asset.symbol)} size={40} />
              </AssetIcon>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{asset.symbol}</div>
                <div className="mt-[3px] truncate text-[12px] text-muted">Sepolia</div>
              </div>
              {/* The figure alone. "in your wallet" was captioning the obvious: this is a list of
                  assets with an amount beside each, and the only amount that could be meant is the
                  one you hold. */}
              <div className="shrink-0 text-[13px] font-semibold tabular-nums">
                {balanceLabel(asset)}
              </div>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-1 shrink-0 text-faint"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          ))
        )}
      </Card>

      {/* A second card, not more rows in the first. These deposits behave differently enough to
          deserve the separation: a different chain to switch to, and a fifteen-minute wait rather
          than eight. Merging them would hide both facts. */}
      {remote.length > 0 || remoteLoading ? (
        <>
          <h2 className="ml-1 mt-5 mb-2.5 text-sm font-medium text-muted">From another chain</h2>
          <Card className="px-5 py-1">
            {remoteLoading ? (
              <div className="py-4">
                <Skeleton className="h-10 w-full rounded-[14px]" />
              </div>
            ) : (
              remote.map((asset, i) => {
                const symbol = asset.native ? "ETH" : "USDC";
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => nav.forward(`/deposit/x/${asset.id}`)}
                    className={`relative flex w-full items-center gap-[13px] py-3.5 text-left transition-colors hover:bg-[#f4f4f4] ${
                      i === 0 ? "" : "border-t border-line"
                    }`}
                  >
                    <AssetIcon chainName={asset.chainName}>
                      <CoinBadge token={badgeForSymbol(symbol)} size={40} />
                    </AssetIcon>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{symbol}</div>
                      {/* The chain is part of the identity here, not a detail: two rows would
                          otherwise both read "USDC" and be indistinguishable. */}
                      <div className="mt-[3px] truncate text-[12px] text-muted">
                        {asset.chainName}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-semibold tabular-nums">
                        {Number(formatUnits(asset.available, asset.decimals)).toLocaleString(
                          "en-US",
                          { maximumFractionDigits: 6 },
                        )}{" "}
                        {symbol}
                      </div>
                      {asset.pending ? (
                        <div className="mt-[3px] text-[11.5px] text-warn">waiting to be signed</div>
                      ) : null}
                    </div>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="ml-1 shrink-0 text-faint"
                      aria-hidden="true"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                );
              })
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
