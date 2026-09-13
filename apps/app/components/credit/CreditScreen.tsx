"use client";
import { formatUnits } from "viem";
import { useCollateral } from "../../hooks/useCollateral";
import { useCreditHistory } from "../../hooks/useCreditHistory";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";
import { Button, Card, CountUp, PageHeader, Skeleton } from "../ui";
import { CycleList } from "./CycleList";
import { LimitWorking } from "./LimitWorking";
import { SpendChart } from "./SpendChart";

/**
 * What the card has earned, which is a record rather than a yield.
 *
 * This screen took over the Earn tab's shape: headline, sub-line, two actions, a bar chart with
 * four ranges, and changed everything it was reporting. Earn promised APY on deposits into Stellar
 * buckets: no part of that exists here, users receive no yield at all, and the numbers on it were a
 * different product's. The layout was worth keeping; the subject was not.
 *
 * **The headline is the limit, not the score.** The score was the headline first, and it read as a
 * fault: it sits at zero straight after a deposit that plainly worked, because a deposit buys a
 * limit and only borrowing and repaying earns a score. Two numbers, one moving and one not, with
 * nothing on screen connecting them. The limit is the figure a deposit actually changes.
 *
 * **The bars are events, not a score curve.** The indexer keeps one current score per account and
 * no history of it, so a score line would have to be invented. `Draw` and `Repayment` rows are
 * stamped and real, so the chart shows borrowing, and settled repayments are counted separately
 * because only a repayment that clears the balance closes a cycle and scores.
 */

const fmt = (value: bigint): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

export function CreditScreen() {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const { limit, drawn, score } = useCreditLine();
  // `collateralValueOf`, which the contract sums across both carriers.
  const { totalValue } = useCollateral();
  const { loading } = useCreditHistory();

  const owes = (drawn ?? 0n) > 0n;

  if (loading) {
    return (
      <div className="stagger">
        <div className="py-[30px] text-center">
          <Skeleton className="mx-auto h-4 w-24" />
          <Skeleton className="mx-auto mt-3 h-[44px] w-[200px] rounded-lg" />
        </div>
        <Card className="p-5">
          <Skeleton className="h-4 w-20" />
          <div className="mt-4 flex h-[118px] items-end gap-1.5">
            {[50, 70, 55, 76, 88, 62, 90, 80, 40].map((height) => (
              <Skeleton
                key={height}
                className="flex-1 rounded-t-md"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // The limit and the two controls that move it. One block, placed differently by width: stacked on
  // a phone, and on desktop lifted into a card beside the record so a 1440px screen is not a narrow
  // column with a chart floating a screen-height below the number it explains.
  const head = (
    <>
      {/*
        Left-aligned, like Home's headline and like every reference dashboard.

        This was centred, which is the phone hero's treatment surviving into a 400px card: a centred
        figure with a row of controls under it makes the controls read as its caption. Aligned to one
        edge they read as a column, label then number then what you can do, and the eye travels one
        line rather than three. Home made this change months ago and Credit did not.

        `py-8` rather than `py-[30px]`: 30 is off the 4/8/12/16/24/32 scale that sixteen of the
        seventeen measured sites use without exception.
      */}
      <div className="py-8">
        <div className="text-[15px] font-medium text-muted">Your limit</div>
        {/*
          A dash until `limitOf` answers, never a zero.

          `loading` here is the indexer's, not the chain's, so this block renders as soon as the
          history lands while the Creditcoin RPC is still four seconds from returning the limit.
          `limit ?? 0n` printed "0 tCTC" for that whole window: a statement that the card is allowed
          nothing, made by a screen that had not asked yet. It is the rule the app's own notes state
          and this was breaking it on the one screen the limit is the subject of.
        */}
        {limit === undefined ? (
          <div className="mt-2 text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] lg:text-[28px]">
            —
          </div>
        ) : (
          <CountUp
            value={Number(formatUnits(limit, 18))}
            format={(n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} tCTC`}
            className="mt-2 block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] lg:text-[28px] [font-variant-numeric:tabular-nums]"
          />
        )}

        {/*
          What is outstanding against the limit.

          The balance was not on this screen at all: `drawn` was read and used only to disable the
          Repay button, so that control sat permanently greyed with no figure and no reason, which
          is the failure this app's own notes name twice.

          The score used to sit here too, and now sits in `LimitWorking` below instead. It was
          printed twice inside one 400px card, and of the two placements only that one is doing any
          work: there it is the cause of the percentage beside it, here it was a bare figure with
          nothing to connect it to.
        */}
        <div className="mt-3 flex items-center gap-2 text-[13px] text-muted [font-variant-numeric:tabular-nums]">
          {/* "Balance", not "owed", and not a new word either: `SpentTotal` and `OverviewHeadline`
              have both said Balance all along, so this screen was the one speaking differently
              about the same figure. The label stays muted and only the number takes the tone, the
              same way the other two render it. */}
          <span>Balance</span>
          <span className={owes ? "text-neg" : "text-ink-2"}>
            {drawn === undefined ? "—" : `${fmt(drawn)} tCTC`}
          </span>
        </div>
      </div>

      {/* The two halves of one cycle, which is what this screen is a record of. Repay is dimmed
          rather than hidden when nothing is owed: a control that vanishes teaches nobody that it
          is the second half. */}
      <div className="flex gap-3">
        <Button
          size={isDesktop ? "md" : "lg"}
          block={!isDesktop}
          onClick={() => nav.forward("/send")}
        >
          Send
        </Button>
        <Button
          size={isDesktop ? "md" : "lg"}
          block={!isDesktop}
          variant="glass"
          disabled={!owes}
          onClick={() => nav.forward("/pay")}
        >
          Repay
        </Button>
      </div>

      {/* The working behind the figure at the top of this card. `mt-auto` on desktop drops it to
          the foot of the rail, which is as tall as the record beside it; on mobile the card is only
          as tall as its content, so the plain margin applies. */}
      <LimitWorking
        collateralValue={totalValue}
        limit={limit}
        score={score}
        className="mt-6 lg:mt-auto"
      />
    </>
  );

  return (
    <div className="stagger">
      {/* The same spine as Overview: a 400px rail beside the record, so moving between the two
          desktop screens does not move the columns under the reader. */}
      {isDesktop ? (
        <PageHeader
          title="Credit"
          description="What the card is allowed, and every cycle that earned it."
          className="mb-5"
        />
      ) : null}

      {/*
        Two rows rather than two columns of unequal length.

        The rail and the record used to be a column each, and with this much content the rail ran
        out 46px above the record and left a ragged edge down the middle of the screen. Stretching
        the short one to match was tried and is worse: the gap simply moves inside the card, and a
        400px card with a hole in the middle of it reads as broken rather than as spacious.

        So the limit and the chart share the top row and end level because the grid makes them, and
        the cycles run the full width underneath. The chart is the one that stretches, which is the
        right way round: a plot with more height is a better plot, where a list with more height is
        just a list with a hole under it.

        `items-stretch` is the grid default and is what does this, so `items-start` had to go.
      */}
      <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:gap-6">
        {isDesktop ? (
          <Card className="flex min-w-0 flex-col px-6 pb-6 pt-1">{head}</Card>
        ) : (
          <div className="mb-5">{head}</div>
        )}

        <SpendChart />

        {/* The screen's actual subject. "Repay cleanly and the same collateral buys a bigger
              limit" is a claim about cycles, and until now a cardholder could not see how many
              they had completed or which ones counted.

              It takes the slack, not the chart. Space below a list of cycles reads as room for the
              next one; the same space inside a chart reads as a chart that failed to draw, and a
              plot stretched to 500px would make one spending day tower over a month of honest
              zeroes. */}
        <CycleList className="mt-6 lg:col-span-2 lg:mt-0" />
      </div>
    </div>
  );
}
