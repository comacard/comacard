"use client";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";
import { useCardAccount } from "../../hooks/useCardAccount";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useKycStart } from "../../hooks/useKycStart";
import { useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useTransactions } from "../../hooks/useTransactions";
import { useWalletAssets } from "../../hooks/useWalletAssets";
import { ActivityList } from "../activity/ActivityList";
import { CardFolderPanel } from "../card/CardFolderPanel";
import { CollateralList } from "../card/CollateralList";
import { IncomingDeposits } from "../card/IncomingDeposits";
import { KycSheet } from "../card/KycSheet";
import { SpentTotal } from "../card/SpentTotal";
import { ActivityDrawer } from "../desktop/ActivityDrawer";
import { LockCollateralDrawer } from "../desktop/LockCollateralDrawer";
import { Button, Card, CountUp, Skeleton } from "../ui";
import { CardHero } from "./CardHero";

/**
 * The desktop Overview, rebuilt from the mobile Home.
 *
 * It was a SoroSense dashboard: bucket rows, an APY growth chart, an agent feed, a headline reading
 * a wallet total in dollars. None of those exist in this product, so it reported a different one.
 *
 * Every figure here now comes from the same hooks Home uses, and the components are literally the
 * same files. Two surfaces cannot drift apart if there is only one implementation between them, and
 * they were already a day apart before this.
 *
 * The layout is the only thing desktop-specific: two columns instead of one, because a phone's
 * vertical stack on a 1440px screen is a column of whitespace. The order within them follows the
 * phone exactly — card, then what backs it, then what it has done.
 */
export function DesktopOverview() {
  const nav = useNav();
  const { panel, open, close } = usePanel();
  const { account, refresh } = useCardAccount();
  const { assets: collateral } = useCollateral();
  const { assets: remoteCollateral } = useRemoteCollateral();
  const { drawn, available } = useCreditLine();
  const { loading, assets } = useWalletAssets();
  const { loading: txLoading, items: transactions } = useTransactions();
  const { verify, url: kycUrl, close: closeKyc, starting } = useKycStart();

  // Didit answers by webhook, never to the tab that opened it, so the card unlocks on the way back.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const needsVerification = account !== null && !account.kyc.verified;
  const owes = (drawn ?? 0n) > 0n;
  const owedLabel = Number(formatUnits(drawn ?? 0n, 18)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
  const preview = transactions.slice(0, 6);
  const hasMore = transactions.length > 6;

  return (
    <>
      <div className="stagger grid gap-4 lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
        {/* The card and what it can do. */}
        <Card className="flex min-w-0 flex-col px-7 py-6">
          {loading ? (
            <div className="py-[30px] text-center">
              <Skeleton className="mx-auto h-4 w-28" />
              <Skeleton className="mx-auto mt-3 h-[46px] w-[210px] rounded-lg" />
            </div>
          ) : (
            <CardHero account={account} />
          )}

          <CardFolderPanel account={account} className="mb-6" />

          {needsVerification ? (
            <Button onClick={verify} disabled={starting}>
              {starting ? "Opening…" : "Verify identity"}
            </Button>
          ) : (
            <>
              {owes ? (
                <div className="mb-2.5 rounded-[16px] border border-line bg-white px-4 py-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] text-muted">Current balance</span>
                    <span className="text-[16px] font-semibold tabular-nums">
                      {owedLabel} tCTC
                    </span>
                  </div>
                  <Button className="mt-3" onClick={() => nav.forward("/pay")}>
                    Repay
                  </Button>
                </div>
              ) : null}

              <div className="flex gap-2.5">
                <Button
                  variant={owes ? "glass" : "ink"}
                  className="flex-1"
                  onClick={() => nav.forward("/spend")}
                  disabled={(available ?? 0n) === 0n}
                >
                  Spend
                </Button>
                <Button variant="glass" className="flex-1" onClick={() => open("deposit")}>
                  Deposit
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* What backs the card, and what it has done. */}
        <div className="flex min-w-0 flex-col gap-4">
          <IncomingDeposits deposits={account?.pendingDeposits ?? []} />
          {owes ? null : <SpentTotal />}
          <CollateralList assets={collateral} remote={remoteCollateral} className="mt-0" />

          <section>
            <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Transactions</h2>
            <Card className="px-5 pb-2 pt-1">
              <ActivityList
                items={preview}
                loading={txLoading}
                reviewed
                emptyTitle="No transactions yet"
                emptyDescription="Locks, draws and repayments will show here once they are on chain."
              />
              {hasMore && (
                <button
                  type="button"
                  onClick={() => open("activity")}
                  className="mt-1.5 flex w-full items-center justify-center border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
                >
                  View all transactions
                </button>
              )}
            </Card>
          </section>

          {/* Wallet balances sit last and small, as on Account: they pay gas, and they are not
              what the card spends. */}
          {assets.length > 0 ? (
            <section>
              <h2 className="mx-1 mb-2 text-sm font-medium text-muted">In your wallet</h2>
              <Card className="px-5 py-1">
                {assets.map((asset, i) => (
                  <div
                    key={asset.token}
                    className={`flex items-baseline justify-between gap-3 py-3 ${
                      i === 0 ? "" : "border-t border-line"
                    }`}
                  >
                    <span className="text-[13.5px] font-medium">{asset.name}</span>
                    <span className="text-[13.5px] font-semibold tabular-nums">
                      <CountUp
                        animateOnMount
                        from={0}
                        value={Number(formatUnits(asset.amount, asset.decimals))}
                        format={(n) =>
                          `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${asset.symbol}`
                        }
                      />
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          ) : null}
        </div>
      </div>

      <LockCollateralDrawer open={panel === "deposit"} onClose={close} />
      <ActivityDrawer open={panel === "activity"} onClose={close} onReview={close} />
      <KycSheet
        open={!!kycUrl}
        url={kycUrl}
        verified={!!account?.kyc.verified}
        onClose={closeKyc}
        onPoll={refresh}
      />
    </>
  );
}
