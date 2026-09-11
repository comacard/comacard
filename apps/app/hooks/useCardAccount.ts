"use client";
import { useCallback, useEffect, useState } from "react";
import { comacardApiEnabled, getAccount, type ComacardAccount } from "../lib/comacard/api";
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

/** One settled read, tagged with the request it answered. The tag is what makes a stale response
 *  from a previous wallet or a previous `refresh` identifiable rather than merely late. */
type Settled = { key: string; account: ComacardAccount | null; error: string | null };

export function useCardAccount() {
  const { address, hydrated } = useWallet();
  const [settled, setSettled] = useState<Settled | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Null whenever there is nothing to fetch: still hydrating, no wallet, or no backend configured.
  // Those three are derived during render rather than pushed into state from an effect, which is
  // both what the lint rule asks for and what keeps "no wallet" from flashing through "loading".
  const key = hydrated && address && comacardApiEnabled() ? `${address}#${nonce}` : null;

  useEffect(() => {
    if (!key || !address) return;
    let alive = true;
    void getAccount(address).then((result) => {
      if (!alive) return;
      setSettled({
        key,
        account: result.ok ? result.value : null,
        error: result.ok ? null : result.message,
      });
    });
    return () => {
      alive = false;
    };
  }, [key, address]);

  const current = settled?.key === key ? settled : null;

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
    loading: !hydrated || (key !== null && current === null),
    refresh,
  };
}
