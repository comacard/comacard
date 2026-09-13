"use client";
import { formatUnits } from "viem";
import { useCreditHistory } from "../../hooks/useCreditHistory";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";
import { Button, Card, CountUp, PageHeader, Skeleton } from "../ui";
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

export function CreditScreen() {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const { limit, drawn } = useCreditLine();
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
      <div className="py-[30px] text-center">
        <div className="text-[15px] font-medium text-muted">Your limit</div>
        <CountUp
          animateOnMount
          from={0}
          value={Number(formatUnits(limit ?? 0n, 18))}
          format={(n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 4 })} tCTC`}
          className="mt-2 block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] lg:text-[28px] [font-variant-numeric:tabular-nums]"
        />
      </div>

      {/* The two halves of one cycle, which is what this screen is a record of. Repay is dimmed
          rather than hidden when nothing is owed: a control that vanishes teaches nobody that it
          is the second half. */}
      <div className="flex gap-3">
        <Button size={isDesktop ? "md" : "lg"} onClick={() => nav.forward("/send")}>
          Send
        </Button>
        <Button
          size={isDesktop ? "md" : "lg"}
          variant="glass"
          disabled={!owes}
          onClick={() => nav.forward("/pay")}
        >
          Repay
        </Button>
      </div>
    </>
  );

  return (
    <div className="stagger">
      {/* The same spine as Overview: a 400px rail beside the record, so moving between the two
          desktop screens does not move the columns under the reader. */}
      {isDesktop ? (
        <PageHeader
          title="Credit"
          description="What the card is allowed, and the record that earns it."
          className="mb-5"
        />
      ) : null}

      <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {isDesktop ? (
          <Card className="flex min-w-0 flex-col px-6 pb-6 pt-1">{head}</Card>
        ) : (
          <div className="mb-5">{head}</div>
        )}

        <SpendChart />
      </div>
    </div>
  );
}
