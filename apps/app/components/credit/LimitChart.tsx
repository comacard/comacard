"use client";
import { formatUnits } from "viem";
import type { LimitPoint } from "../../hooks/useLimitHistory";
import { cn } from "../../lib/utils";

/**
 * The limit over time, which is the one claim this product makes about itself.
 *
 * "Repay cleanly and the same collateral buys a bigger limit" is a statement about a number
 * changing, and until the indexer kept `ScoreChanged` there was nothing on any screen that showed
 * it. The bars beside this one are spend: what was drawn and paid. This is the result.
 *
 * **A step chart, not a line.** A limit does not drift between events. It sits at one figure until
 * a draw, a repayment, a deposit or a release moves it, and then it is at another. Joining the
 * points with a slope would draw a value the account never had, on a screen whose subject is a
 * verifiable history. The horizontal run is the truth and the vertical jump is the event.
 *
 * Drawn as SVG rather than with a chart library: four points on a testnet account do not need one,
 * and a library is a dependency plus a bundle for a shape that is nine lines of path data.
 */

const ctc = (v: bigint): string =>
  Number(formatUnits(v, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

const W = 600;
const H = 150;

export function LimitChart({
  points,
  className = "",
}: {
  points: LimitPoint[];
  className?: string;
}) {
  // One point is a fact, not a history. Two is the minimum that can show a direction.
  if (points.length < 2) return null;

  const values = points.map((p) => Number(formatUnits(p.limit, 18)));
  const times = points.map((p) => p.at);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const t0 = times[0] as number;
  const span = (times[times.length - 1] as number) - t0 || 1;
  // A flat series would divide by zero and, worse, sit on the floor with nothing to read.
  const range = max - min || 1;

  const x = (t: number) => ((t - t0) / span) * W;
  const y = (v: number) => H - ((v - min) / range) * H;

  // Each event holds its value until the next one, so the path runs across and then jumps.
  let d = `M 0 ${y(values[0] as number)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${x(times[i] as number)} ${y(values[i - 1] as number)} L ${x(times[i] as number)} ${y(values[i] as number)}`;
  }
  d += ` L ${W} ${y(values[values.length - 1] as number)}`;

  const last = points[points.length - 1] as LimitPoint;
  const first = points[0] as LimitPoint;
  const rose = last.limit > first.limit;

  /*
    The accent is earned, not decorative.

    Green means "this went as intended" everywhere else on this product, and drawing a series in it
    that ends lower than it started is the chart telling one story while its own figures tell
    another. That is the same failure as the yield chart this screen replaced, in a subtler form.

    Not red either, for the opposite reason. A limit falling because the holder took their
    collateral back is the product working: they asked for it and they got it. Red would read as a
    fault and there is no fault. Neutral says what happened and leaves the reading to the figures.
  */
  const accent = rose ? "var(--color-pos)" : "var(--color-muted)";

  return (
    <div className={cn("", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        role="img"
        aria-label={`Limit history, from ${ctc(first.limit)} to ${ctc(last.limit)} tCTC`}
      >
        <title>{`Limit from ${ctc(first.limit)} to ${ctc(last.limit)} tCTC`}</title>
        {/* The area first, so the stroke sits on top of its own fill rather than under it. */}
        <path d={`${d} L ${W} ${H} L 0 ${H} Z`} fill="url(#limitFill)" stroke="none" />
        <path
          d={d}
          fill="none"
          stroke={accent}
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <defs>
          <linearGradient id="limitFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.16} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      <div className="mt-3 flex items-baseline justify-between gap-3 text-[12.5px] text-muted tabular-nums">
        <span>{ctc(first.limit)} tCTC</span>
        <span className={rose ? "text-pos" : ""}>{ctc(last.limit)} tCTC</span>
      </div>
    </div>
  );
}
