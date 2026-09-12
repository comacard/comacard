"use client";
import { useQuery } from "@tanstack/react-query";
import { query as graphql } from "../lib/comacard/graphql/client";
import { REMOTE_WITHDRAWALS } from "../lib/comacard/graphql/queries";
import { useWallet } from "./useWallet";

/**
 * Withdrawals this wallet has asked for and not yet taken.
 *
 * A withdrawal is three transactions on two chains, and only the first and last are the borrower's.
 * Between them the guardians sign and the relay lets the vault release the money, which is the
 * protocol working; after them the money sits in the vault until the borrower signs for it, which
 * is not the protocol waiting on anything. `RemoteWithdrawal` carries a timestamp for each, so the
 * two gaps can be told apart and neither is described as the other.
 *
 * Reading this rather than holding the stage in component state is what makes a request survive a
 * reload. Without it, leaving the screen between asking and claiming erases every trace of the
 * request except a limit that dropped for no reason anyone can see.
 *
 * An unreachable indexer throws rather than answering "no withdrawals": the two are different, and
 * reporting the second when the first is true is how a screen says something it does not know.
 */

export type RemoteWithdrawal = {
  id: string;
  assetId: string;
  amount: bigint;
  decimals: number;
  wormholeChainId: number;
  requestedAt: number;
  requestTxHash: string;
  /** Set once the guardians have signed and the relay has approved it on the far chain. */
  approvedAt: number | null;
  approveTxHash: string | null;
};

type Row = {
  id: string;
  amount: string;
  sequence: string;
  requestedAt: string;
  requestTxHash: string;
  approvedAt: string | null;
  approveTxHash: string | null;
  asset: { id: string; wormholeChainId: number; decimals: number } | null;
};

export function useRemoteWithdrawals(): {
  items: RemoteWithdrawal[];
  loading: boolean;
  error: boolean;
  refresh: () => void;
} {
  const { address } = useWallet();

  const result = useQuery({
    queryKey: ["comacard", "remote-withdrawals", address],
    enabled: Boolean(address),
    // Faster than the 30s elsewhere: the approval lands in about thirty seconds on BSC and Fuji,
    // and this poll is what turns the screen from "on its way" into a button.
    refetchInterval: 15_000,
    queryFn: async (): Promise<RemoteWithdrawal[]> => {
      const answer = await graphql<{ RemoteWithdrawal: Row[] }>(REMOTE_WITHDRAWALS, {
        // The indexer lower-cases account ids; a checksummed address matches nothing.
        wallet: (address as string).toLowerCase(),
        limit: 25,
      });
      if (!answer.ok) throw new Error(answer.message);

      return (answer.value.RemoteWithdrawal ?? []).flatMap((row) =>
        row.asset === null
          ? // A mid-sync read: the withdrawal row has landed and its asset row has not. Dropping it
            // is right — without decimals the amount cannot be shown, and inventing 18 would
            // misreport a 6-decimal stablecoin by twelve orders of magnitude.
            []
          : [
              {
                id: row.id,
                assetId: row.asset.id,
                amount: BigInt(row.amount),
                decimals: row.asset.decimals,
                wormholeChainId: row.asset.wormholeChainId,
                requestedAt: Number(row.requestedAt),
                requestTxHash: row.requestTxHash,
                approvedAt: row.approvedAt === null ? null : Number(row.approvedAt),
                approveTxHash: row.approveTxHash,
              },
            ],
      );
    },
  });

  return {
    items: result.data ?? [],
    loading: Boolean(address) && result.isLoading,
    error: result.isError,
    refresh: () => {
      void result.refetch();
    },
  };
}
