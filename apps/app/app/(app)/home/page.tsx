"use client";
import { useEffect, useState } from "react";
import { ActivityList } from "../../../components/activity/ActivityList";
import { CardFolderPanel } from "../../../components/card/CardFolderPanel";
import { ClaimableCollateral } from "../../../components/card/ClaimableCollateral";
import { CollateralList } from "../../../components/card/CollateralList";
import { IncomingDeposits } from "../../../components/card/IncomingDeposits";
import { KycSheet } from "../../../components/card/KycSheet";
import { SpentTotal } from "../../../components/card/SpentTotal";
import { CardHero } from "../../../components/home/CardHero";
import { DesktopOverview } from "../../../components/home/DesktopOverview";
import { MoreSheet } from "../../../components/home/MoreSheet";
import {
  ActionPill,
  ActionRow,
  Button,
  Card,
  Skeleton,
  Spinner,
  Toast,
} from "../../../components/ui";
import { useCardAccount } from "../../../hooks/useCardAccount";
import { useCollateral } from "../../../hooks/useCollateral";
import { useCreditLine } from "../../../hooks/useCreditLine";
import { useKycStart } from "../../../hooks/useKycStart";
import { useNav } from "../../../hooks/useNav";
import { useRemoteCollateral } from "../../../hooks/useRemoteCollateral";
import { useTransactions } from "../../../hooks/useTransactions";
import { useWalletAssets } from "../../../hooks/useWalletAssets";

function MobileHome() {
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = useNav();
  const { loading } = useWalletAssets();
  const { loading: txLoading, items: transactions } = useTransactions();
  const { account, refresh } = useCardAccount();
  // Native plus every listed ERC20, read off the chain rather than from a hardcoded list.
  const { assets: collateral } = useCollateral();
  // Deposits from chains Attestcoin cannot reach. The credit line already counts these toward the
  // limit, so leaving them out would show a headline backed by more than the rows below it.
  const { assets: remoteCollateral, loading: remoteLoading } = useRemoteCollateral();
  // What the card owes, if anything. Zero means the cycle is closed.
  const { drawn, available, availableLoading } = useCreditLine();
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
        {/* Actions above the card, not below it. The number is what the eye lands on and these are
            what it can do about the number; the card is the object being described, and it reads
            better as the answer than as a thing to scroll past. */}
        {needsVerification ? (
          <Button className="mb-[22px]" onClick={verify} disabled={starting}>
            {starting ? "Opening…" : "Verify identity"}
          </Button>
        ) : (
          <ActionRow className="mb-[22px]">
            {/* Send leads and stays filled whether or not a balance is open. The order is fixed:
                moving the primary around as state changes makes the row feel unstable, and a person
                reaching for the same button twice should find it in the same place. */}
            <ActionPill
              primary
              onClick={() => nav.forward("/send")}
              // Disabled while the limit is unknown, but not silently: four seconds of a greyed
              // control with no explanation reads as a refusal rather than a read in flight.
              disabled={availableLoading || (available ?? 0n) === 0n}
            >
              {availableLoading ? <Spinner /> : "Send"}
            </ActionPill>
            <ActionPill onClick={() => nav.forward("/deposit")}>Deposit</ActionPill>
            {/* No figure on the pill. The balance is a fact about the account, not part of the name
                of the control that settles it, and it is already stated on Credit. */}
            {owes ? <ActionPill onClick={() => nav.forward("/pay")}>Repay</ActionPill> : null}
            {/* Round rather than labelled: it has no name of its own, and "More" would take as much
                width as a real action for something that is a door rather than a destination. */}
            <ActionPill aria-label="More" className="!w-11 !px-0" onClick={() => setMoreOpen(true)}>
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </ActionPill>
          </ActionRow>
        )}

        <CardFolderPanel account={account} className="mb-[26px]" />

        {/* Before the collateral list, because an incoming deposit is the answer to "why has my
          limit not moved". Seeing the backing first and the explanation second is backwards. */}
        <IncomingDeposits deposits={account?.pendingDeposits ?? []} className="mb-[22px]" />

        {/* Money that has already left the limit and is waiting on one signature. A nudge, not a
            spinner: nothing is pending on the protocol here. */}
        <ClaimableCollateral assets={remoteCollateral} sepolia={collateral} className="mb-[22px]" />

        {/* The balance owed, always rendered. It used to be lifetime spend, shown only when the
          card was settled, which meant the one row about money either said nothing while there was
          a balance or showed a number that looked like one after it had been paid. */}
        <SpentTotal className="mb-[22px]" />

        {/* What the headline is actually built on. Locking more moves the number at the top of this
          screen. */}
        <CollateralList
          assets={collateral}
          remote={remoteCollateral}
          loading={remoteLoading}
          className="mb-[22px] mt-0"
        />

        <h2 className="mx-1 mb-2 text-sm font-medium text-muted">Transactions</h2>
        <Card className="px-5 pb-2 pt-1">
          <ActivityList
            items={preview}
            loading={txLoading}
            emptyTitle="No transactions yet"
            emptyDescription="Locks, draws and repayments will show here once they are on chain."
          />
          {hasMore && (
            <button
              type="button"
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
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        remote={remoteCollateral}
        sepolia={collateral}
        onNavigate={nav.forward}
      />
      <Toast open={!!kycError} message={kycError ?? ""} />
    </div>
  );
}

/**
 * Which Overview renders, decided by CSS rather than by JavaScript.
 *
 * **The flash this removes.** `useIsDesktop` returns false on the server and on the first client
 * render, then flips in a passive effect. `AuthGate` holds the page until the wallet hydrates, so
 * the first mount happens after hydration with `isDesktop` still false: the phone screen mounted,
 * ran its hooks, painted, and only then was replaced by the desktop one. A visible swap, on every
 * visit, on a 1440px monitor.
 *
 * The same file already does this for the two navigation bars (`lg:hidden` on TopBlur and
 * BottomNav), so the precedent and the breakpoint are both established here.
 *
 * **Both trees are in the DOM now, which is why `useCardAccount` had to move to React Query
 * first.** It was a raw effect, so two mounted callers meant two real `GET /account/:wallet`
 * calls, and a CSS branch would have made that permanent rather than transient. Every other hook
 * on this screen was already Query-backed and deduplicated on its own.
 *
 * The cost is a second DOM, not a second fetch. `AccountMenu` stays behind the JS check in the
 * layout because it is a dropdown with its own state, not a page.
 */
export default function HomePage() {
  return (
    <>
      <div data-testid="home-mobile" className="lg:hidden">
        <MobileHome />
      </div>
      <div data-testid="home-desktop" className="hidden lg:block">
        <DesktopOverview />
      </div>
    </>
  );
}
