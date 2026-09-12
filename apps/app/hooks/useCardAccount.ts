"use client";
import { useCallback, useEffect, useState } from "react";
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
 */

/**
 * One settled read, tagged with the **wallet** it describes.
 *
 * Tagged by address and not by request. An earlier version keyed this on `address#nonce`, which
 * meant every `refresh()` invalidated the data it already had: `account` went null for the length
 * of the round trip, and Home read that null as "identity not required" and flipped its button from
 * Verify identity to Deposit and back on every window focus. A refresh now refetches without
 * discarding what it is refreshing. Only a change of wallet invalidates.
 */
type Settled = { address: string; account: ComacardAccount | null; error: string | null };

export function useCardAccount() {
  const { address, hydrated } = useWallet();
  const [settled, setSettled] = useState<Settled | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // False whenever there is nothing to fetch: still hydrating, no wallet, or no backend configured.
  // Derived during render rather than pushed into state from an effect, which is both what the lint
  // rule asks for and what keeps "no wallet" from flashing through "loading".
  const canFetch = Boolean(hydrated && address && comacardApiEnabled());

  // biome-ignore lint/correctness/useExhaustiveDependencies: the extra dep is a deliberate refetch trigger, not a value the body reads
  useEffect(() => {
    if (!canFetch || !address) return;
    let alive = true;
    void getAccount(address).then((result) => {
      if (!alive) return;
      setSettled({
        address,
        account: result.ok ? result.value : null,
        error: result.ok ? null : result.message,
      });
    });
    return () => {
      alive = false;
    };
    // `nonce` is what `refresh()` bumps; it belongs in the deps even though the body never reads it.
  }, [canFetch, address, nonce]);

  const current = settled?.address === address ? settled : null;

  const error = !hydrated
    ? null
    : !address
      ? "Connect a wallet to see your card."
      : !comacardApiEnabled()
        ? "The card backend is not configured."
        : (current?.error ?? null);

  return {
    account: current?.account ?? null,
    error,
    // Only the FIRST read of a wallet is a loading state. A refresh keeps the previous answer on
    // screen, so nothing downstream has to cope with the account briefly vanishing.
    loading: !hydrated || (canFetch && current === null),
    refresh,
  };
}
