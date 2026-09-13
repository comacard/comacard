"use client";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { useCardAccount } from "../../hooks/useCardAccount";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useKycStart } from "../../hooks/useKycStart";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";
import { useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useTransactions } from "../../hooks/useTransactions";
import { useWalletAssets } from "../../hooks/useWalletAssets";
import { ActivityList } from "../activity/ActivityList";
import { CardFolderPanel } from "../card/CardFolderPanel";
import { ClaimableCollateral } from "../card/ClaimableCollateral";
import { CollateralList } from "../card/CollateralList";
import { IncomingDeposits } from "../card/IncomingDeposits";
import { KycSheet } from "../card/KycSheet";
import { SpendChart } from "../credit/SpendChart";
import { ActivityDrawer } from "../desktop/ActivityDrawer";
import { LockCollateralDrawer } from "../desktop/LockCollateralDrawer";
import { Button, Card, CountUp, PageHeader, Section, Spinner } from "../ui";
import { OverviewHeadline } from "./OverviewHeadline";

/**
 * The desktop Overview.
 *
 * Every figure comes from the hooks the phone uses, and most of the blocks are literally the same
 * files. What is desktop-specific is only the arrangement, and this is the second pass at it: the
 * first was the phone's single column split in two, which measured badly enough to be worth
 * recording. At 1440px the content ran 1368px wide (95% of the viewport), the two columns came out
 * 598px and 372px tall so the shorter one held all the data, "Repay" rendered as a 481×56 pill for
 * a five-letter label, and the card artwork (the one object on screen with a fixed size) sat in
 * 517px of container with 177px of air around it. docs/desktop-layout-research.md has the readings
 * and the seventeen sites they were compared against.
 *
 * Three things changed as a result.
 *
 * **One figure leads, not four.** This was a band of four tiles at identical weight, which states
 * that available, limit, balance and lifetime spend are peers. They are one number and three of its
 * derivations, and no banking or card product surveyed renders a row of equal KPI tiles for its
 * primary money figures. `OverviewHeadline` leads with the figure the next action depends on, which
 * is spending power most days and the balance inside an open cycle.
 *
 * **The actions sit on the title line, beside the figure they act on.** Mercury's credit page header
 * is `Credit Card · How limits work · Request a limit increase · Pay`; Chase groups limit, balance
 * and available credit in one panel with Make a Payment in the same view. `PageHeader` has had an
 * `action` slot since it was written and nothing ever passed one, so the right thousand pixels of
 * this row were empty on both desktop screens.
 *
 * **The rail is sized to the card.** `400px` rather than a fraction, because its contents have a
 * natural width (a 340px card image) and a fluid column just pads it. Stripe, coinbase and privacy
 * all name their column widths in pixels for the same reason.
 *
 * **It sticks.** `items-start` is what allows that: a stretched grid item is as tall as its row and
 * has nothing to stick within.
 */

/**
 * What the card can do, at desktop button size.
 *
 * Settling leads when there is something to settle: only a repayment that clears the balance closes
 * a cycle, but it never replaces the other two. The figure it refers to is in the strip above, so
 * this is the control alone rather than a panel restating the balance.
 */
function CardActions({
  owes,
  canSpend,
  checking,
  onSpend,
  onRepay,
  onDeposit,
}: {
  owes: boolean;
  canSpend: boolean;
  /** The limit has not been read yet. Disabled, but not as a refusal. */
  checking: boolean;
  onSpend: () => void;
  onRepay: () => void;
  onDeposit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {owes ? (
        <Button size="md" onClick={onRepay}>
          Repay balance
        </Button>
      ) : null}
      <div className="flex gap-2.5">
        <Button
          size="md"
          variant={owes ? "glass" : "ink"}
          className="flex-1"
          onClick={onSpend}
          disabled={checking || !canSpend}
        >
          {checking ? <Spinner /> : "Send"}
        </Button>
        <Button size="md" variant="glass" className="flex-1" onClick={onDeposit}>
          Deposit
        </Button>
      </div>
    </div>
  );
}

export function DesktopOverview() {
  const nav = useNav();
  const { panel, open, close } = usePanel();
  const { account, loading: accountLoading, refresh } = useCardAccount();
  const { assets: collateral } = useCollateral();
  const { assets: remoteCollateral, loading: remoteLoading } = useRemoteCollateral();
  const { limit, drawn, available, score, availableLoading } = useCreditLine();
  const { assets } = useWalletAssets();
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
  const preview = transactions.slice(0, 8);
  const hasMore = transactions.length > 8;

  return (
    <>
      <div className="stagger">
        {/*
          The figure and the verb on one line, which is what every card product surveyed does.

          Mercury's credit page header reads `Credit Card · How limits work · Request a limit
          increase · Pay`; Chase groups credit limit, balance and available credit in one Account
          Summary panel with Make a Payment in the same view. The failure mode when a balance and
          its action are separated is documented: a UX study of Bank of America's card flow found
          people copying an amount from one page and pasting it into another because the pay button
          was neither adjacent nor primary.

          `PageHeader`'s `action` slot has existed and been unused since it was written, leaving the
          right thousand pixels of this row empty on both desktop screens.
        */}
        <PageHeader
          title="Overview"
          className="mb-5"
          action={
            needsVerification ? (
              <Button size="md" block={false} onClick={verify} disabled={starting}>
                {starting ? "Opening…" : "Verify identity"}
              </Button>
            ) : (
              <CardActions
                owes={owes}
                canSpend={(available ?? 0n) > 0n}
                checking={availableLoading}
                onSpend={() => nav.forward("/send")}
                onRepay={() => nav.forward("/pay")}
                onDeposit={() => open("deposit")}
              />
            )
          }
        />

        {/* One figure, and which one depends on whether a cycle is open. Replaces four tiles of
            equal weight, which said that available, limit, balance and lifetime spend are peers. */}
        <OverviewHeadline
          spendable={account?.card.spendableCtc}
          limit={limit}
          drawn={drawn}
          score={score}
          loading={accountLoading}
          unissued={needsVerification}
          className="mb-6"
        />

        {/*
          Two columns, grouped by what a thing IS rather than by what fits.

          Left: the card and what backs it, which is everything you hold. Right: what has happened,
          which is the chart and the history. The rail used to hold the card and two buttons and
          then roughly 600px of permanent white space; giving it the asset list fills it with
          something that belongs there, and the actions are in the page header now.

          The rail no longer sticks. It sticks only when it is much shorter than the column beside
          it, and with the asset list in it the two are close enough that pinning it would freeze a
          long block against a scrolling one.
        */}
        <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="flex min-w-0 flex-col px-6 pb-6 pt-5">
              <CardFolderPanel account={account} />
            </Card>

            <CollateralList
              assets={collateral}
              remote={remoteCollateral}
              loading={remoteLoading}
              className="mt-0"
            />
          </div>

          {/* What the card has done. */}
          <div className="flex min-w-0 flex-col gap-6">
            <IncomingDeposits deposits={account?.pendingDeposits ?? []} />
            {/* Above the record, because this is money that has already stopped backing the limit
                and is waiting on a signature. */}
            <ClaimableCollateral assets={remoteCollateral} />

            {/* The chart sat on Credit, the screen a cardholder opens least, while the limit it is
                a record of leads this one. Mercury's credit page puts its summary and its chart side
                by side for the same reason: they are two readings of one thing. */}
            <SpendChart />

            {/* Wallet balances sit last and small, as on Account: they pay gas, and they are not
                what the card spends. */}
            {assets.length > 0 ? (
              <Section title="In your wallet">
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
              </Section>
            ) : null}
          </div>
        </div>

        {/*
          Full width, below the columns, because it is the one working surface on the page.

          Mercury caps its overview at 968px and runs its transactions table edge to edge at 1267,
          and the distinction is what each page is for: an overview is read, a table is worked. It
          also carries more per-row metadata than anything above it, so it is the block that most
          wants the width.
        */}
        <Section
          title="Transactions"
          action={
            hasMore ? (
              <button
                type="button"
                onClick={() => open("activity")}
                className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
              >
                View all
              </button>
            ) : undefined
          }
        >
          <Card className="px-5 py-1">
            <ActivityList
              items={preview}
              loading={txLoading}
              emptyTitle="No transactions yet"
              emptyDescription="Locks, draws and repayments will show here once they are on chain."
            />
          </Card>
        </Section>
      </div>

      <LockCollateralDrawer open={panel === "deposit"} onClose={close} />
      <ActivityDrawer open={panel === "activity"} onClose={close} />
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
