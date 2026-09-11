"use client";
import { useCallback, useState } from "react";
import { startKyc } from "../lib/comacard/api";
import { useWallet } from "./useWallet";

/**
 * Starting identity verification, in one place because two screens offer it.
 *
 * `verify()` opens a session and hands back its URL through `url`, for `KycSheet` to load in an
 * iframe. It deliberately does NOT navigate: sending someone to another tab mid-signup is where
 * they stop coming back, and Didit's hosted flow embeds cleanly (see the notes in `KycSheet`).
 *
 * Didit answers by webhook to our KYC service, never to the page, so the caller has to re-read the
 * account to learn the outcome. `useCardAccount().refresh` is what does that.
 */
export function useKycStart(): {
  verify: () => Promise<void>;
  /** The session URL once one exists; null while closed. */
  url: string | null;
  close: () => void;
  starting: boolean;
  error: string | null;
  clearError: () => void;
} {
  const { address } = useWallet();
  const [url, setUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    if (!address) return;
    setStarting(true);
    setError(null);
    const result = await startKyc(address);
    setStarting(false);
    if (!result.ok) {
      setError(`Could not start verification: ${result.message}`);
      return;
    }
    setUrl(result.value.url);
  }, [address]);

  return {
    verify,
    url,
    close: useCallback(() => setUrl(null), []),
    starting,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}
