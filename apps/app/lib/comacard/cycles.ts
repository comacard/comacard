import type { CreditEvent } from "../../hooks/useCreditHistory";

/**
 * The borrowing cycles a card has been through, assembled from draws and repayments.
 *
 * **This is what earns the limit, and nothing on any screen showed it.** A cycle opens on a draw
 * and closes on the repayment that clears the balance to zero. Only a closed cycle raises the
 * score, and only the score makes the same collateral buy a bigger limit. That sentence is the
 * product, and a cardholder had no way to see how many they had completed or what any one of them
 * did.
 *
 * **A cycle shorter than `minCycleDuration` scores nothing, silently.** The deployed contract sets
 * it to 60 seconds rather than the 1-day default. A draw repaid faster settles the debt, moves the
 * score by zero, and emits no error and no explanation. That is recorded in the root CLAUDE.md as
 * one of the traps that costs an afternoon, and it is invisible on chain: the repayment looks
 * identical to one that scored. Marking those rows is the one thing this file exists to make
 * possible.
 *
 * **What this cannot show is the limit at the time.** `ScoreChanged` carries the score, the limit
 * and the available credit together, but the indexer consumes it to update one `Account` row and
 * keeps no history of it, so there is no series to read. Reading the logs directly is not an
 * option either: the Creditcoin RPC enforces a 10-second query timeout, and a 50,000-block window
 * exceeds it while 5,000 blocks answers in about 1.3 seconds, so a full history would be dozens of
 * serial round trips. Issue filed. Until then this screen shows what happened, not what the limit
 * was when it happened, and it does not guess.
 */

/** The deployed value, not the 1-day default. `minCycleDuration()` on the live contract. */
export const MIN_CYCLE_SECONDS = 60;

export type Cycle = {
  /** The opening draw's id, so a row has a stable key. */
  id: string;
  /** Unix seconds the cycle opened. */
  openedAt: number;
  /** Unix seconds it closed, or null while it is still open. */
  closedAt: number | null;
  /** Everything drawn while it was open, in credit-asset wei. */
  borrowed: bigint;
  /** Everything repaid against it. Equals `borrowed` on a closed cycle. */
  repaid: bigint;
  /**
   * True when the cycle closed AND stayed open past `minCycleDuration`.
   *
   * The two conditions are separate and both are invisible without this: a cycle can close and
   * score nothing, which is the trap the contract sets by measuring from the first draw.
   */
  scored: boolean;
  /** Closed, but too fast to count. The row that most needs explaining. */
  tooFast: boolean;
  /** The transaction that opened it, and the one that closed it. */
  openTxHash: string;
  closeTxHash: string | null;
};

/**
 * Fold a time-ordered event list into cycles.
 *
 * Draws while a cycle is open add to it rather than opening another, because the contract measures
 * one balance per account: a second draw does not start a second cycle, it grows the first. The
 * `drawnAt` the contract times against is the first draw, which is why `openedAt` is the first and
 * not the last.
 */
export function toCycles(events: CreditEvent[]): Cycle[] {
  const ordered = [...events].sort((a, b) => a.at - b.at);
  const cycles: Cycle[] = [];
  let open: Cycle | null = null;

  for (const event of ordered) {
    if (event.kind === "borrow") {
      if (open === null) {
        open = {
          id: event.id,
          openedAt: event.at,
          closedAt: null,
          borrowed: event.amount,
          repaid: 0n,
          scored: false,
          tooFast: false,
          openTxHash: event.txHash,
          closeTxHash: null,
        };
        cycles.push(open);
      } else {
        open.borrowed += event.amount;
      }
      continue;
    }

    // A repayment with no open cycle is history the indexer has only half of: the opening draw is
    // outside the queried window. Dropping it is better than inventing a cycle to hold it.
    if (open === null) continue;

    open.repaid += event.amount;
    if (event.settled) {
      open.closedAt = event.at;
      open.closeTxHash = event.txHash;
      const held = event.at - open.openedAt;
      open.tooFast = held < MIN_CYCLE_SECONDS;
      open.scored = !open.tooFast;
      open = null;
    }
  }

  // Newest first: a history screen is read from the top, and the most recent cycle is the one a
  // person is checking.
  return cycles.reverse();
}

/** Closed cycles that actually moved the score. What the limit was earned by. */
export const scoredCount = (cycles: Cycle[]): number => cycles.filter((c) => c.scored).length;
