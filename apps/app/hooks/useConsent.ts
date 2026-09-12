"use client";
import { useEffect, useState } from "react";
import { useVault } from "./useVault";
import { useWallet } from "./useWallet";

/**
 * Whether the depositor has signed the auto-optimize mandate. The seam exposes only `hasConsent`
 * (boolean) and `setPolicyConsent` (idempotent) — there is no way to revoke, and no timestamp — so
 * Account renders a read-only status row rather than a switch. A real switch is STE-38/39/40.
 *
 * Fail-closed: a read that rejects renders "Off". Showing "On" because a read failed would tell the
 * user their funds are under a mandate we could not actually confirm.
 */
export function useConsent(): { loading: boolean; enabled: boolean } {
  const { address } = useWallet();
  const { client, version } = useVault();
  const [state, setState] = useState({ loading: true, enabled: false });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the extra dep is a deliberate refetch trigger, not a value the body reads
  useEffect(() => {
    let cancelled = false;
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a fetch-with-cancellation effect body; the branching is the cancelled/error/empty handling the pattern requires
    void (async () => {
      if (!address) {
        if (!cancelled) setState({ loading: false, enabled: false });
        return;
      }
      try {
        const enabled = await client.hasConsent(address);
        if (!cancelled) setState({ loading: false, enabled });
      } catch (e) {
        // Fail-closed stays the visible behavior (Off), but a swallowed error hides real bugs
        // (e.g. a typo'd call) behind the same "Off" a legitimate network failure would show.
        console.error("useConsent: hasConsent read failed, rendering Off", e);
        if (!cancelled) setState({ loading: false, enabled: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, client, version]);

  return state;
}
