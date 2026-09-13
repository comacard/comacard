"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { type ComacardAccount, comacardApiEnabled, getAccount } from "../lib/comacard/api";
import { useWallet } from "./useWallet";

/**
 * The connected wallet's credit-line account, as `apps/api` sees it.
 *
 * Deliberately has no fixture fallback, unlike the vault hooks. A card is a claim about a real
 * identity and a real limit: with the backend off or unreachable the honest answer is "we do not
 * know yet", not a plausible-looking card. `account` stays null and the screen says so.
 *
 * KYC resolves through Didit's webhook, so the verdict never arrives in the response to our own
 * request. `refresh` is what the screen calls when the user comes back from the Didit tab.
 *
 * **React Query, and the reason is the desktop/mobile split rather than tidiness.** This was a raw
 * `useEffect` and `useState`, so two mounted callers meant two real `GET /account/:wallet` calls.
 * Home branches on `useIsDesktop`, which is false on the first client render and true immediately
 * after, so `MobileHome` mounted, fetched, painted, and then `DesktopOverview` mounted and fetched
 * again. Every other hook on that screen absorbed it because they are all Query-backed; this one
 * was the exception. It matters more now: replacing the JS branch with a CSS one mounts both trees
 * at once, which would have made the duplicate permanent rather than transient.
 *
 * Keyed by address alone, never by a refresh counter. An earlier version keyed on `address#nonce`,
 * which meant every `refresh()` invalidated the data it already had: `account` went null for the
 * length of the round trip, and Home read that null as "identity not required" and flipped its
 * button from Verify identity to Deposit and back on every window focus. `invalidateQueries`
 * refetches in place and keeps the previous answer on screen. Only a change of wallet discards.
 */

const KEY = ["comacard", "card-account"] as const;

export function useCardAccount() {
  const { address, hydrated } = useWallet();
  const queryClient = useQueryClient();

  // False whenever there is nothing to fetch: still hydrating, no wallet, or no backend configured.
  const canFetch = Boolean(hydrated && address && comacardApiEnabled());

  const query = useQuery({
    queryKey: [...KEY, address ?? null],
    enabled: canFetch,
    // The card's own state, not a market figure. Refetching it on every focus is what the explicit
    // `refresh` after a Didit round trip is for.
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    queryFn: async (): Promise<{ account: ComacardAccount | null; error: string | null }> => {
      const result = await getAccount(address as string);
      // Resolved rather than thrown: a backend that answered "no account" and a backend that could
      // not be reached are different, and both belong in the data so the screen can tell them apart.
      return result.ok
        ? { account: result.value, error: null }
        : { account: null, error: result.message };
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: KEY });
  }, [queryClient]);

  const error = !hydrated
    ? null
    : !address
      ? "Connect a wallet to see your card."
      : !comacardApiEnabled()
        ? "The card backend is not configured."
        : (query.data?.error ?? null);

  return {
    account: query.data?.account ?? null,
    error,
    // Only the FIRST read of a wallet is a loading state. A refresh keeps the previous answer on
    // screen, so nothing downstream has to cope with the account briefly vanishing.
    loading: !hydrated || (canFetch && query.data === undefined && !query.isError),
    refresh,
  };
}
