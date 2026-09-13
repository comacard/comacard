"use client";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { binEvents, useCreditHistory } from "../../hooks/useCreditHistory";
import { useCreditLine } from "../../hooks/useCreditLine";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";
import { Bars } from "../earn/Bars";
import { Button, Card, CountUp, PageHeader, Segmented, Skeleton } from "../ui";

/**
 * What the card has earned, which is a record rather than a yield.
 *
 * This screen took over the Earn tab's shape — headline, sub-line, two actions, a bar chart with
 * four ranges — and changed everything it was reporting. Earn promised APY on deposits into Stellar
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RANGES = ["Day", "Week", "Month", "Year"] as const;
type Range = (typeof RANGES)[number];

const WINDOW: Record<Range, { ms: number; bars: number }> = {
  Day: { ms: DAY, bars: 24 },
  Week: { ms: 7 * DAY, bars: 7 },
  Month: { ms: 30 * DAY, bars: 30 },
  Year: { ms: 365 * DAY, bars: 12 },
};

const ctc = (value: bigint, digits = 4): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: digits });

export function CreditScreen() {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const { limit, drawn } = useCreditLine();
  const { events, borrowed, repaid, cyclesClosed, loading, error } = useCreditHistory();
  const [range, setRange] = useState<Range>("Month");

  // Read after mount, never during render: a clock read while rendering bakes the server's time
  // into the HTML and makes the render impure.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(tick);
    const timer = setInterval(tick, 60_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);

  const owes = (drawn ?? 0n) > 0n;
  const { ms, bars } = WINDOW[range];
  const series =
    now === null ? new Array(bars).fill(0) : binEvents(events, "borrow", ms, bars, now);
  const hasHistory = events.length > 0;

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
          className="mt-2 block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
        />
      </div>

      {/* The two halves of one cycle, which is what this screen is a record of. Repay is dimmed
          rather than hidden when nothing is owed: a control that vanishes teaches nobody that it
          is the second half. */}
      <div className="flex gap-3">
        <Button size={isDesktop ? "md" : "lg"} onClick={() => nav.forward("/send")}>
          Spend
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

        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold text-muted">Spend</h2>
            {error ? null : (
              <span className="text-[12.5px] text-muted tabular-nums">
                {cyclesClosed} {cyclesClosed === 1 ? "cycle" : "cycles"} closed
              </span>
            )}
          </div>

          {error ? (
            /* The record lives in the indexer, and an indexer that did not answer has not told us
               there is no record. "Nothing spent yet" would be this screen asserting the one thing
               it cannot currently see. */
            <div className="py-7 text-center">
              <p className="text-[13.5px] font-semibold text-ink">Record unavailable</p>
              <p className="mt-1 text-[12.5px] text-muted">
                The indexer did not answer. The limit and balance above are read from the chain and
                are current.
              </p>
            </div>
          ) : hasHistory ? (
            <>
              <Bars values={series} className="mt-4" />
              <div className="mt-3 flex items-baseline justify-between gap-3 text-[12.5px] text-muted tabular-nums">
                <span>{ctc(borrowed)} tCTC borrowed</span>
                <span>{ctc(repaid)} tCTC repaid</span>
              </div>
            </>
          ) : (
            /* Empty rather than filled with an example. A chart of invented borrowing on the one
             screen whose subject is a truthful record would undo the point of the screen. */
            <div className="py-7 text-center">
              <p className="text-[13.5px] font-semibold text-ink">Nothing spent yet</p>
            </div>
          )}

          <Segmented
            className="mt-4"
            options={RANGES}
            value={range}
            onChange={setRange}
            label="Period"
            variant="period"
          />
        </Card>
      </div>
    </div>
  );
}
