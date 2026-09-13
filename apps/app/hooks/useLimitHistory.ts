"use client";
import { useQuery } from "@tanstack/react-query";
import { query as graphql } from "../lib/comacard/graphql/client";
import { SCORE_HISTORY } from "../lib/comacard/graphql/queries";
import { pollInterval } from "../lib/comacard/polling";
import { useWallet } from "./useWallet";

/**
 * What the limit has been, which the chain cannot answer.
 *
 * `limitOf` is read live everywhere else in this app, and that is right: repricing collateral moves
 * every limit at once without an event per account, so only the contract knows the figure now. The
 * cost of that design is that the contract has no memory, and this screen's whole subject is a
 * number that is supposed to grow. `ScoreChanged` is the event that records each move, and the
 * indexer keeps one row per emission.
 *
 * **The rows are kept and the line is filtered, which are two different things.** `refreshScore` is
 * permissionless and re-emits whether or not anything moved, so the same account can produce two
 * identical rows minutes apart. Drawing a point per row puts flat steps on the chart at moments
 * nothing happened. `changed` is the indexer's own comparison against the row before it, so the
 * line is drawn from those and the ledger keeps everything.
 */

export type LimitPoint = {
  id: string;
  /** Credit-asset wei. */
  limit: bigint;
  available: bigint;
  score: bigint;
  /** Unix seconds. */
  at: number;
  txHash: string;
};

type Row = {
  id: string;
  score: string;
  creditLimit: string;
  available: string;
  changed: boolean;
  timestamp: string;
  txHash: string;
};

export function useLimitHistory(): {
  /** Only the rows where something moved. Oldest first, which is drawing order. */
  points: LimitPoint[];
  /** Every row, including re-emissions that changed nothing. */
  all: LimitPoint[];
  loading: boolean;
  error: boolean;
} {
  const { address } = useWallet();

  const result = useQuery({
    queryKey: ["comacard", "limit-history", address],
    enabled: Boolean(address),
    // The limit moves when a deposit lands or a cycle closes, both of which somebody is watching
    // for. Paced by whether the series is empty rather than by a fixed clock would need a signal
    // this hook does not have, so it takes the idle rate and the screens around it hurry instead.
    refetchInterval: pollInterval(false),
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<LimitPoint[]> => {
      const res = await graphql<{ ScoreChange: Row[] }>(SCORE_HISTORY, {
        // The indexer lower-cases account ids; a checksummed address matches nothing.
        wallet: (address as string).toLowerCase(),
        limit: 200,
      });
      // Thrown rather than defaulted to an empty array. "No history" and "the history could not be
      // read" are different answers, and a chart that draws the first when it means the second is
      // telling somebody their limit never moved.
      if (!res.ok) throw new Error("limit history unavailable");

      return (res.value.ScoreChange ?? []).map((row: Row) => ({
        id: row.id,
        limit: BigInt(row.creditLimit),
        available: BigInt(row.available),
        score: BigInt(row.score),
        at: Number(row.timestamp),
        txHash: row.txHash,
        changed: row.changed,
      })) as (LimitPoint & { changed: boolean })[];
    },
  });

  const all = (result.data ?? []) as (LimitPoint & { changed: boolean })[];

  return {
    points: all.filter((p) => p.changed),
    all,
    loading: result.isLoading,
    error: result.isError,
  };
}
