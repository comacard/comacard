"use client";
import { useEffect } from "react";
import { formatUnits } from "viem";
import { useCardAccount } from "../../hooks/useCardAccount";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditHistory } from "../../hooks/useCreditHistory";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useKycStart } from "../../hooks/useKycStart";
import { useNav } from "../../hooks/useNav";
import { usePanel } from "../../hooks/usePanel";
import { useRemoteCollateral } from "../../hooks/useRemoteCollateral";
import { useTransactions } from "../../hooks/useTransactions";
import { useWalletAssets } from "../../hooks/useWalletAssets";
import type { ComacardAccount } from "../../lib/comacard/api";
import { ActivityList } from "../activity/ActivityList";
import { CardFolderPanel } from "../card/CardFolderPanel";
import { CollateralList } from "../card/CollateralList";
import { IncomingDeposits } from "../card/IncomingDeposits";
import { KycSheet } from "../card/KycSheet";
import { ActivityDrawer } from "../desktop/ActivityDrawer";
import { LockCollateralDrawer } from "../desktop/LockCollateralDrawer";
import { Button, Card, CountUp, PageHeader, Section, type Stat, StatStrip } from "../ui";

/**
 * The desktop Overview.
 *
 * Every figure comes from the hooks the phone uses, and most of the blocks are literally the same
 * files. What is desktop-specific is only the arrangement, and this is the second pass at it: the
 * first was the phone's single column split in two, which measured badly enough to be worth
 * recording. At 1440px the content ran 1368px wide (95% of the viewport), the two columns came out
 * 598px and 372px tall so the shorter one held all the data, "Repay" rendered as a 481×56 pill for
 * a five-letter label, and the card artwork — the one object on screen with a fixed size — sat in
 * 517px of container with 177px of air around it. docs/desktop-layout-research.md has the readings
 * and the seventeen sites they were compared against.
 *
 * Three things changed as a result.
 *
 * **The summary comes first.** A screen whose whole subject is what you can spend, what you are
 * allowed, what you owe and what you have used led with none of those in a place the eye lands. Two
 * of them were not on the screen at all, and "do I owe anything" was answered by whether a box
 * existed. `StatStrip` is now the first thing under the title, which is what every dashboard
 * measured does. It also absorbs the phone's `CardHero` and `SpentTotal` — same hooks, same
 * numbers, one row instead of a headline in one column and a card in the other.
 *
 * **The rail is sized to the card.** `400px` rather than a fraction, because its contents have a
 * natural width (a 340px card image) and a fluid column just pads it. Stripe, coinbase and privacy
 * all name their column widths in pixels for the same reason.
 *
 * **It sticks.** The rail is roughly a third of the right-hand stack's height, and left to scroll it
 * spends most of the page as blank space beside the rows that explain it. `items-start` is what
 * allows that: a stretched grid item is as tall as its row and has nothing to stick within.
 */

const ctc = (value: bigint | null | undefined): string | null =>
  value === null || value === undefined
    ? null
    : `${Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 })} tCTC`;

/**
 * The four figures, built outside the component so the arrangement below stays readable.
 *
 * `spendable` comes off the backend rather than being derived from `available` here: it is the
 * minimum of available credit and whatever else gates the card, and re-deriving that in the client
 * is how a screen promises credit the card will refuse. It is the same field the phone's hero reads.
 */
function overviewStats({
  account,
  limit,
  drawn,
  borrowed,
  historyUnread,
}: {
  account: ComacardAccount | null;
  limit: bigint | undefined;
  drawn: bigint | undefined;
  borrowed: bigint;
  historyUnread: boolean;
}): Stat[] {
  const unissued = account !== null && !account.kyc.verified;
  const spendable = account?.card.spendableCtc;
  const owes = (drawn ?? 0n) > 0n;
  return [
    {
      label: "Available to spend",
      value: unissued || spendable === undefined ? null : `${spendable} tCTC`,
      hint: unissued ? "Card not issued yet" : undefined,
    },
    { label: "Credit limit", value: ctc(limit) },
    {
      label: "Balance",
      value: ctc(drawn),
      tone: owes ? "neg" : "ink",
      hint: owes ? "Repay in full to close the cycle" : undefined,
    },
    // What has ever come out of the card, counted from Draw events and never from the wallet: tCTC
    // that arrived from a faucet was never spent here.
    { label: "Spent from your card", value: historyUnread ? null : ctc(borrowed) },
  ];
}

/**
 * What the card can do, at desktop button size.
 *
 * Settling leads when there is something to settle — only a repayment that clears the balance closes
 * a cycle — but it never replaces the other two. The figure it refers to is in the strip above, so
 * this is the control alone rather than a panel restating the balance.
 */
function CardActions({
  owes,
  canSpend,
  onSpend,
  onRepay,
  onDeposit,
}: {
  owes: boolean;
  canSpend: boolean;
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
          disabled={!canSpend}
        >
          Spend
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
  const { assets: remoteCollateral } = useRemoteCollateral();
  const { limit, drawn, available } = useCreditLine();
  const { borrowed, loading: historyLoading, error: historyError } = useCreditHistory();
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

  const stats = overviewStats({
    account,
    limit,
    drawn,
    borrowed,
    // A dead indexer reports no spending, which is not the same as no spending having happened.
    historyUnread: historyLoading || historyError,
  });

  return (
    <>
      <div className="stagger">
        <PageHeader
          title="Overview"
          description="Your card, what backs it, and everything it has done."
          className="mb-5"
        />

        {/* The strip's own first read, not the wallet's: the four figures come from the card
            account, the credit line and the indexer, and gating them on an unrelated query is how a
            resolved number ends up behind a skeleton. After that first read each tile decides for
            itself, and an unknown one prints a dash rather than a zero. */}
        <StatStrip stats={stats} loading={accountLoading} className="mb-6" />

        <div className="grid items-start gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          {/* The card itself, and the two things you can do with it. */}
          <Card className="flex min-w-0 flex-col px-6 pb-6 pt-5 lg:sticky lg:top-[88px]">
            <CardFolderPanel account={account} className="mb-5" />

            {needsVerification ? (
              <Button size="md" onClick={verify} disabled={starting}>
                {starting ? "Opening…" : "Verify identity"}
              </Button>
            ) : (
              <CardActions
                owes={owes}
                canSpend={(available ?? 0n) > 0n}
                onSpend={() => nav.forward("/spend")}
                onRepay={() => nav.forward("/pay")}
                onDeposit={() => open("deposit")}
              />
            )}
          </Card>

          {/* What backs the card, and what it has done. */}
          <div className="flex min-w-0 flex-col gap-6">
            <IncomingDeposits deposits={account?.pendingDeposits ?? []} />
            <CollateralList assets={collateral} remote={remoteCollateral} className="mt-0" />

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
                  reviewed
                  emptyTitle="No transactions yet"
                  emptyDescription="Locks, draws and repayments will show here once they are on chain."
                />
              </Card>
            </Section>

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
