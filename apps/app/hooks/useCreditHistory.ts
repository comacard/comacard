"use client";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { query as graphql } from "../lib/comacard/graphql/client";
import { CREDIT_HISTORY } from "../lib/comacard/graphql/queries";
import { useWallet } from "./useWallet";

/**
 * The record a score is built from: every borrow, every repayment, in time order.
 *
 * **Built from events, not from a score series, because no score series exists.** The indexer's
 * `Account` row carries one current `score` and one current `limit` and no history of either. What
 * it does keep is `Draw` and `Repayment` rows with timestamps, so the shape of someone's record is
 * reconstructable even though the curve of their score is not. That is a real limit and the chart
 * is drawn to it: bars are what happened, never an interpolated score.
 *
 * A borrow that has been settled is counted separately from one still open, because only a
 * repayment clearing the balance to zero closes a cycle and scores. Colouring them the same would
 * show a record that has not been earned yet.
 */

export type CreditEvent = {
  id: string;
  kind: "borrow" | "repay";
  /** Credit-asset wei. */
  amount: bigint;
  /** Unix seconds. */
  at: number;
  txHash: string;
  /** Repayments only: true when this one cleared the balance and closed a cycle. */
  settled: boolean;
};

type Row = {
  id: string;
  amount: string;
  timestamp: string;
  txHash: string;
  settled?: boolean;
};

export function useCreditHistory(): {
  events: CreditEvent[];
  /** Total ever borrowed and total ever repaid, in credit-asset wei. */
  borrowed: bigint;
  repaid: bigint;
  /** Cycles closed by a repayment that cleared the balance. */
  cyclesClosed: number;
  loading: boolean;
  error: boolean;
} {
  const { address } = useWallet();

  const result = useQuery({
    queryKey: ["comacard", "credit-history", address],
    enabled: Boolean(address),
    refetchInterval: 30_000,
    queryFn: async (): Promise<CreditEvent[]> => {
      const result = await graphql<{ Draw: Row[]; Repayment: Row[] }>(CREDIT_HISTORY, {
        // The indexer lower-cases account ids; a checksummed address matches nothing.
        wallet: (address as string).toLowerCase(),
        limit: 100,
      });
      // The client returns a tagged result rather than throwing. An unreachable indexer is an empty
      // record here, which is also what a wallet that has never borrowed looks like — and that is
      // the honest rendering either way, since neither has a history to draw.
      if (!result.ok) return [];
      const data = result.value;

      const borrows: CreditEvent[] = (data.Draw ?? []).map((row: Row) => ({
        id: `borrow-${row.id}`,
        kind: "borrow",
        amount: BigInt(row.amount),
        at: Number(row.timestamp),
        txHash: row.txHash,
        settled: false,
      }));
      const repayments: CreditEvent[] = (data.Repayment ?? []).map((row: Row) => ({
        id: `repay-${row.id}`,
        kind: "repay",
        amount: BigInt(row.amount),
        at: Number(row.timestamp),
        txHash: row.txHash,
        settled: Boolean(row.settled),
      }));

      return [...borrows, ...repayments].sort((a, b) => a.at - b.at);
    },
  });

  const events = result.data ?? [];
  let borrowed = 0n;
  let repaid = 0n;
  let cyclesClosed = 0;
  for (const event of events) {
    if (event.kind === "borrow") borrowed += event.amount;
    else {
      repaid += event.amount;
      if (event.settled) cyclesClosed += 1;
    }
  }

  return {
    events,
    borrowed,
    repaid,
    cyclesClosed,
    loading: Boolean(address) && result.isLoading,
    error: result.isError,
  };
}

/**
 * Bucket events into a fixed window, one bar per interval, in whole credit-asset units.
 *
 * Fixed windows rather than fitting the bars to the data, so the four periods are genuinely
 * different charts instead of the same handful of events re-binned four ways. Events outside the
 * window are dropped rather than clamped into the first bar, which would invent activity on a day
 * nothing happened.
 */
export function binEvents(
  events: CreditEvent[],
  kind: CreditEvent["kind"],
  windowMs: number,
  bars: number,
  now: number,
): number[] {
  const out = new Array<number>(bars).fill(0);
  const start = now - windowMs;
  const binMs = windowMs / bars;
  for (const event of events) {
    if (event.kind !== kind) continue;
    const ms = event.at * 1000;
    if (ms < start || ms > now) continue;
    const index = Math.min(bars - 1, Math.floor((ms - start) / binMs));
    out[index] = (out[index] ?? 0) + Number(formatUnits(event.amount, 18));
  }
  return out;
}
