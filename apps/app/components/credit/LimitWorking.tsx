"use client";
import { formatUnits } from "viem";
import { borrowableBps } from "../../lib/comacard/credit";
import { cn } from "../../lib/utils";

/**
 * Where the limit came from, shown as the arithmetic it is.
 *
 * **The one screen whose subject is how a limit is earned did not show how it was arrived at.** It
 * printed a figure and left the reader to take it on faith, which is a poor trade on a product
 * whose whole pitch is that the number moves in response to what you do. Mercury puts a "How limits
 * work" link in its credit header for a limit that is simply set; this one is earned, so the working
 * is worth more than a link.
 *
 * Two rows, not three. The result row was going to repeat "Your limit" and the same figure inside a
 * 400px card that states both directly above it, so the working is the two inputs and the headline
 * is the answer they multiply to. That is a deliberate departure from the sketch Axel approved,
 * made because the duplication only became visible once it was on screen.
 *
 * **The percentage is derived from the two figures beside it, not from `borrowableBps`.** Integer
 * division truncates 8291.87 to 8291, so a ratio taken from basis points renders 82.91% while the
 * limit on screen reflects 82.9187%, and the three rows would visibly fail to multiply through by
 * about 0.004 tCTC. Deriving it from what is actually displayed makes the arithmetic exact as
 * rendered. `borrowableBps` is still the answer when there is no collateral to divide by.
 */

const ctc = (value: bigint): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 py-2",
        strong ? "border-t border-line" : "",
      )}
    >
      <span className="text-[12.5px] text-muted">{label}</span>
      <span
        className={cn("text-[13px] tabular-nums", strong ? "font-semibold text-ink" : "text-ink-2")}
      >
        {value}
      </span>
    </div>
  );
}

export function LimitWorking({
  collateralValue,
  limit,
  score,
  className = "",
}: {
  /** `collateralValueOf` on the credit line: both carriers, summed by the contract. */
  collateralValue: bigint | null;
  limit: bigint | undefined;
  score: bigint | undefined;
  className?: string;
}) {
  // Any figure missing makes the arithmetic unshowable, and a partial sum would be worse than
  // nothing: two of three rows invite the reader to complete the third themselves, wrongly.
  if (collateralValue === null || limit === undefined || score === undefined) return null;

  const share =
    collateralValue > 0n
      ? (Number(formatUnits(limit, 18)) / Number(formatUnits(collateralValue, 18))) * 100
      : Number(borrowableBps(score)) / 100;

  return (
    <div className={cn("", className)}>
      <h2 className="mb-1 text-[13px] font-semibold text-muted">How this is set</h2>
      <Row label="Collateral held" value={`${ctc(collateralValue)} tCTC`} />
      {/* Cause and effect on one line: this is your score, this is the share it buys. */}
      <Row label={`At score ${score}`} value={`${share.toFixed(2)}%`} strong />
    </div>
  );
}
