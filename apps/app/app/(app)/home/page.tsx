"use client";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardFolderPanel } from "../../../components/card/CardFolderPanel";
import { CollateralList } from "../../../components/card/CollateralList";
import { IncomingDeposits } from "../../../components/card/IncomingDeposits";
import { KycSheet } from "../../../components/card/KycSheet";
import { SpentTotal } from "../../../components/card/SpentTotal";
import { CardHero } from "../../../components/home/CardHero";
import { DesktopOverview } from "../../../components/home/DesktopOverview";
import { Button, Card, Skeleton, Toast } from "../../../components/ui";
import { useCardAccount } from "../../../hooks/useCardAccount";
import { useCollateral } from "../../../hooks/useCollateral";
import { useCreditLine } from "../../../hooks/useCreditLine";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { useKycStart } from "../../../hooks/useKycStart";
import { useNav } from "../../../hooks/useNav";
import { useRemoteCollateral } from "../../../hooks/useRemoteCollateral";
import { useTransactions } from "../../../hooks/useTransactions";
import { useWalletAssets } from "../../../hooks/useWalletAssets";

function MobileHome() {
  const nav = useNav();
  const { loading } = useWalletAssets();
  const { loading: txLoading, items: transactions } = useTransactions();
  const { account, refresh } = useCardAccount();
  // Native plus every listed ERC20, read off the chain rather than from a hardcoded list.
  const { assets: collateral } = useCollateral();
  // Deposits from chains Attestcoin cannot reach. The credit line already counts these toward the
  // limit, so leaving them out would show a headline backed by more than the rows below it.
  const { assets: remoteCollateral } = useRemoteCollateral();
  // What the card owes, if anything. Zero means the cycle is closed.
  const { drawn, available } = useCreditLine();
  const {
    verify,
    url: kycUrl,
    close: closeKyc,
    starting,
    error: kycError,
    clearError,
  } = useKycStart();

  // Didit answers through a webhook, never to the tab that opened it, so the card unlocks on the
  // way back rather than on a response.
  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  useEffect(() => {
    if (!kycError) return;
    const timer = setTimeout(clearError, 4000);
    return () => clearTimeout(timer);
  }, [kycError, clearError]);

  // Depositing into a card nobody has issued yet is not a thing you can do, so until identity
  // clears the primary action is the step that actually unblocks the user.
  const needsVerification = account !== null && !account.kyc.verified;
  const owes = (drawn ?? 0n) > 0n;
  const owedLabel = Number(formatUnits(drawn ?? 0n, 18)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
  const preview = transactions.slice(0, 3);
  const hasMore = transactions.length > 3;

  return (
    <div>
      <div className="stagger">
        {loading ? (
          <div className="py-[30px] text-center">
            <Skeleton className="mx-auto h-4 w-28" />
            <Skeleton className="mx-auto mt-3 h-[46px] w-[210px] rounded-lg" />
          </div>
        ) : (
          <CardHero account={account} />
        )}
        <CardFolderPanel account={account} className="mb-[26px]" />

        {needsVerification ? (
          <Button className="mb-[22px]" onClick={verify} disabled={starting}>
            {starting ? "Opening…" : "Verify identity"}
          </Button>
        ) : (
          <>
            {/* An open balance leads, because settling it is what scores. It does not replace the
              other two: depositing has nothing to do with owing, and hiding it was a mistake. */}
            {owes ? (
              <div className="mb-2.5 rounded-[16px] border border-line bg-white px-4 py-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] text-muted">Current balance</span>
                  <span className="text-[16px] font-semibold tabular-nums">{owedLabel} tCTC</span>
                </div>
                <Button className="mt-3" onClick={() => nav.forward("/pay")}>
                  Repay
                </Button>
              </div>
            ) : null}

            <div className="mb-[22px] flex gap-2.5">
              <Button
                variant={owes ? "glass" : "ink"}
                className="flex-1"
                onClick={() => nav.forward("/spend")}
                disabled={(available ?? 0n) === 0n}
              >
                Spend
              </Button>
              <Button variant="glass" className="flex-1" onClick={() => nav.forward("/deposit")}>
                Deposit
              </Button>
            </div>
          </>
        )}

        {/* Before the collateral list, because an incoming deposit is the answer to "why has my
          limit not moved". Seeing the backing first and the explanation second is backwards. */}
        <IncomingDeposits deposits={account?.pendingDeposits ?? []} className="mb-[22px]" />

        {/* Taken from the card, above what backs it. Read from Draw events rather than the wallet,
          because tCTC that arrived from anywhere else was never spent on this card.
          Hidden while a balance is open: the two figures are different questions — what is owed
          now, and what has ever been taken — but they read as one repeated number until the first
          repayment makes them diverge. */}
        {owes ? null : <SpentTotal className="mb-[22px]" />}

        {/* What the headline is actually built on. Locking more moves the number at the top of this
          screen. */}
        <CollateralList assets={collateral} remote={remoteCollateral} className="mb-[22px] mt-0" />

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
              onClick={() => nav.forward("/transactions")}
              className="mt-1.5 flex w-full items-center justify-center border-t border-line pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted"
            >
              View all transactions
            </button>
          )}
        </Card>
      </div>

      <KycSheet
        open={!!kycUrl}
        url={kycUrl}
        verified={!!account?.kyc.verified}
        onClose={closeKyc}
        onPoll={refresh}
      />
      <Toast open={!!kycError} message={kycError ?? ""} />
    </div>
  );
}

export default function HomePage() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopOverview /> : <MobileHome />;
}
