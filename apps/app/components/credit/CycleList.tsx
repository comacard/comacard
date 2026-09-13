"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import { useCreditHistory } from "../../hooks/useCreditHistory";
import { type Cycle, MIN_CYCLE_SECONDS, toCycles } from "../../lib/comacard/cycles";
import { cn } from "../../lib/utils";
import { Card, LoadMore, Skeleton } from "../ui";

/**
 * Every borrowing cycle this card has been through, and what each one earned.
 *
 * **This is the screen the product's own sentence describes.** "Repay cleanly and the same
 * collateral buys a bigger limit" is a claim about cycles, and a cardholder had no way to see how
 * many they had completed, which ones counted, or why. The limit was a number with no working.
 *
 * **The row that matters most is the one that scored nothing.** `minCycleDuration` is 60 seconds on
 * the deployed contract, so a draw repaid faster settles the debt and moves the score by zero, with
 * no error and nothing on chain to tell it apart from a cycle that scored. Somebody who spent and
 * repaid quickly, twice, would reasonably conclude the scoring is broken. That row now says so.
 *
 * **It does not show the limit at the time, and does not pretend to.** `ScoreChanged` carries score,
 * limit and available together, but the indexer consumes it into one `Account` row and keeps no
 * history, and the Creditcoin RPC's 10-second query timeout makes reading the logs directly
 * impractical (50,000 blocks times out; 5,000 answers in ~1.3s, so a full history is dozens of
 * serial round trips). What is shown is what happened. What the limit was when it happened needs an
 * indexer change, which is filed.
 */

const ctc = (value: bigint): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Rows before "Load more". Six fills the card without turning the screen into a scroll. */
const PAGE = 6;

function held(cycle: Cycle): string {
  if (cycle.closedAt === null) return "still open";
  const seconds = cycle.closedAt - cycle.openedAt;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function Row({ cycle, first }: { cycle: Cycle; first: boolean }) {
  const when = new Date(cycle.openedAt * 1000);

  return (
    <div className={cn("flex items-center gap-3 py-3", first ? "" : "border-t border-line")}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold tabular-nums">{ctc(cycle.borrowed)} tCTC</div>
        <div className="mt-0.5 text-[12px] text-muted">
          {when.toLocaleDateString("en-US", { day: "numeric", month: "short" })}
          <span className="text-faint"> · </span>
          {held(cycle)}
        </div>
      </div>

      {/*
        The outcome, in words rather than a colour alone. Three states and they are genuinely
        different: one earned a mark, one is still running, and one closed and earned nothing.
      */}
      {cycle.scored ? (
        <span className="shrink-0 text-[12.5px] font-medium text-pos">Scored</span>
      ) : cycle.closedAt === null ? (
        <span className="shrink-0 text-[12.5px] text-muted">Open</span>
      ) : (
        <span className="shrink-0 text-right text-[12.5px] text-warn">
          No mark
          <span className="block text-[11.5px] text-muted">under {MIN_CYCLE_SECONDS}s</span>
        </span>
      )}
    </div>
  );
}

export function CycleList({ className = "" }: { className?: string }) {
  const { events, loading, error } = useCreditHistory();
  const [shown, setShown] = useState(PAGE);

  const cycles = toCycles(events);
  const visible = cycles.slice(0, shown);

  return (
    <Card className={cn("p-5", className)}>
      <h2 className="text-[13px] font-semibold text-muted">Cycles</h2>

      {loading ? (
        <div className="mt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="flex-1">
                <Skeleton className="h-[13px] w-24 rounded" />
                <Skeleton className="mt-1.5 h-[11px] w-28 rounded" />
              </div>
              <Skeleton className="h-[11px] w-12 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        /* A dead indexer has not told us there is no history. Saying "no cycles yet" here would be
           this screen asserting the one thing it currently cannot see. */
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">Record unavailable</p>
          <p className="mt-1 text-[12.5px] text-muted">
            The indexer did not answer. The limit and score above are read from the chain and are
            current.
          </p>
        </div>
      ) : cycles.length === 0 ? (
        <div className="py-7 text-center">
          <p className="text-[13.5px] font-semibold text-ink">No cycles yet</p>
          <p className="mt-1 max-w-[320px] mx-auto text-[12.5px] leading-snug text-muted">
            Spend from the card, then repay the balance in full. Hold it open for a minute or more
            and the cycle raises your score, which raises the limit the same collateral buys.
          </p>
        </div>
      ) : (
        <div className="mt-1">
          {visible.map((cycle, i) => (
            <Row key={cycle.id} cycle={cycle} first={i === 0} />
          ))}
          {visible.length < cycles.length ? (
            <LoadMore onClick={() => setShown((n) => n + PAGE)} />
          ) : null}
        </div>
      )}
    </Card>
  );
}
