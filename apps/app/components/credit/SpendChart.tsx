"use client";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { binEvents, useCreditHistory } from "../../hooks/useCreditHistory";
import { cn } from "../../lib/utils";
import { Card, Segmented } from "../ui";
import { Bars } from "./Bars";

/**
 * What has come out of the card and what has gone back, over a chosen window.
 *
 * **Extracted so it can sit beside the figure it explains.** It lived only on Credit, which is the
 * screen a cardholder visits least, while the limit it is a record of leads the Overview. Mercury's
 * credit page puts its summary rail and its chart side by side for exactly this reason: they are
 * two readings of one thing, and splitting them across routes means neither page answers a question
 * on its own.
 *
 * **The range switcher is above the chart now.** It was below it, so the control that decides what
 * you are looking at sat after the thing you had finished looking at. Every reference dashboard puts
 * a range switcher above or beside the chart title.
 *
 * **The bars are events, not a score curve.** The indexer keeps one current score per account and no
 * history of it, so a score line would have to be invented. `Draw` and `Repayment` rows are stamped
 * and real, so the chart shows borrowing, and settled repayments are counted separately because only
 * a repayment that clears the balance closes a cycle and scores.
 *
 * **An indexer that did not answer has not said there is no record.** The failed read gets its own
 * message rather than the empty state, because "Nothing spent yet" would be this component
 * asserting the one thing it currently cannot see.
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

export function SpendChart({ className = "" }: { className?: string }) {
  const { events, borrowed, repaid, cyclesClosed, error } = useCreditHistory();
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

  const { ms, bars } = WINDOW[range];
  const series =
    now === null ? new Array(bars).fill(0) : binEvents(events, "borrow", ms, bars, now);
  const hasHistory = events.length > 0;

  return (
    // A column, so that when the grid stretches this card to the height of the limit rail beside
    // it, the extra height reaches the plot rather than pooling in a blank strip under it.
    <Card className={cn("flex min-w-0 flex-col p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold text-muted">Spend</h2>
          {error ? null : (
            <span className="text-[12.5px] text-muted tabular-nums">
              {cyclesClosed} {cyclesClosed === 1 ? "cycle" : "cycles"} closed
            </span>
          )}
        </div>

        <Segmented
          options={RANGES}
          value={range}
          onChange={setRange}
          label="Period"
          variant="period"
          fluid={false}
        />
      </div>

      {error ? (
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">Record unavailable</p>
          <p className="mt-1 text-[12.5px] text-muted">
            The indexer did not answer. The limit and balance above are read from the chain and are
            current.
          </p>
        </div>
      ) : hasHistory ? (
        <>
          {/* `h-full` inside a `flex-1` wrapper rather than a height of its own: the plot is
              whatever the card has left after the header and the two figures under it. The 150px
              floor is what it stands at on mobile, where nothing stretches the card. */}
          <div className="flex min-h-[150px] flex-1 flex-col justify-end">
            <Bars values={series} className="mt-4 h-full" />
          </div>
          <div className="mt-3 flex items-baseline justify-between gap-3 text-[12.5px] text-muted tabular-nums">
            {/* A card statement says spent and paid. "borrowed" and "repaid" are the lending
                product underneath. */}
            <span>{ctc(borrowed)} tCTC spent</span>
            <span>{ctc(repaid)} tCTC paid</span>
          </div>
        </>
      ) : (
        /* Empty rather than filled with an example. A chart of invented borrowing on the one
           component whose subject is a truthful record would undo the point of it. */
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">Nothing spent yet</p>
        </div>
      )}
    </Card>
  );
}
