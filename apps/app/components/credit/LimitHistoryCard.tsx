"use client";
import { useLimitHistory } from "../../hooks/useLimitHistory";
import { cn } from "../../lib/utils";
import { Card, Skeleton } from "../ui";
import { LimitChart } from "./LimitChart";

/**
 * The limit's own history, on the screen whose subject is how it was earned.
 *
 * This card replaced the spend chart here, which was rendering on Overview as well. Two screens
 * drawing the same bars is one of them not having found its own subject: Overview is about what the
 * card can do now, Credit is about what earned it. Spend stayed there, and the figure that actually
 * moves in response to a cycle closing is here.
 *
 * Every state is its own sentence. A read that failed is not an account with no history, and an
 * account with one event is not an account with a trend; saying either as though it were the other
 * is the failure this repository keeps writing down.
 */
export function LimitHistoryCard({ className = "" }: { className?: string }) {
  const { points, loading, error } = useLimitHistory();

  return (
    <Card className={cn("flex min-w-0 flex-col p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-semibold text-muted">Limit history</h2>
          {!error && points.length > 0 ? (
            <span className="text-[12.5px] text-muted tabular-nums">
              {points.length} {points.length === 1 ? "change" : "changes"}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-1 flex-col justify-end gap-2">
          <Skeleton className="h-[120px] w-full rounded-[10px]" />
        </div>
      ) : error ? (
        /* The same rule the rest of this screen follows: an unread figure is a dash, and an unread
           history is a sentence saying so rather than an empty chart. */
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">History unavailable</p>
          <p className="mt-1 text-[12.5px] text-muted">
            The indexer did not answer. The limit above is read from the chain and is current.
          </p>
        </div>
      ) : points.length >= 2 ? (
        <div className="mt-4 flex min-h-[150px] flex-1 flex-col justify-end">
          <LimitChart points={points} className="flex h-full flex-col justify-end" />
        </div>
      ) : (
        /* One point is a fact rather than a history, and no points is a card nobody has used yet.
           Neither is a chart, and inventing a trend on the screen that exists to prove one would
           undo the screen. */
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">
            {points.length === 0 ? "No limit yet" : "Nothing has moved it yet"}
          </p>
          <p className="mt-1 text-[12.5px] text-muted">
            {points.length === 0
              ? "Put collateral down and the limit appears here."
              : "Spend and pay it back in full, and the change shows here."}
          </p>
        </div>
      )}
    </Card>
  );
}
