"use client";
import { useQuery } from "@tanstack/react-query";
import { comacardApiEnabled, type FullCard, getCard } from "../lib/comacard/api";
import { useWallet } from "./useWallet";

/**
 * The unmasked card number and CVV, fetched only when the holder asks to see them.
 *
 * `enabled` is the reveal toggle, and gating on it is the point rather than an optimisation. The
 * backend deliberately keeps the full PAN and the CVV off `GET /account/:wallet`; fetching them on
 * page load would put them back into every screen's memory and undo that split. Nothing here is
 * cached beyond the session, and `gcTime` drops them once nothing is watching.
 */
export function useCardSecrets(enabled: boolean): {
  card: FullCard | null;
  loading: boolean;
  error: string | null;
} {
  const { address } = useWallet();

  const result = useQuery({
    queryKey: ["comacard", "card", address],
    enabled: enabled && !!address && comacardApiEnabled(),
    // The card is derived from a secret and a wallet, so it never changes for a given wallet.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 60_000,
    retry: false,
    queryFn: async () => {
      const res = await getCard(address ?? "");
      if (!res.ok) throw new Error(res.message);
      return res.value;
    },
  });

  return {
    card: result.data ?? null,
    loading: result.isLoading,
    error: result.isError ? (result.error as Error).message : null,
  };
}
