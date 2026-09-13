/**
 * Local storage keys, and the one-time move off the `soro.` prefix they were ported with.
 *
 * The prefix came from the product this app was ported from. Renaming a key is normally not worth
 * the cost, because every value
 * under the old name is abandoned the moment the code stops reading it: the connected wallet, the
 * onboarding flag, and, worst of the three, the local record of a withdrawal that has been signed
 * but not yet claimed. That record is not held anywhere else, so losing it would leave money in a
 * vault with nothing on screen pointing at it.
 *
 * `migrate` is why the rename is safe. It runs before the first read, moves anything still under
 * the old name, and deletes the old key so it happens exactly once per browser.
 */

const MOVED: Record<string, string> = {
  "soro.wallet": "comacard.wallet",
  "soro.wallet.name": "comacard.wallet.name",
  "soro.wallet.id": "comacard.wallet.id",
  "soro.onboarding.done": "comacard.onboarding.done",
  "soro.remote.origin.v1": "comacard.remote.origin.v1",
  "soro.release.pending.v1": "comacard.release.pending.v1",
  "soro.e2e.connected": "comacard.e2e.connected",
};

export const STORAGE = {
  wallet: "comacard.wallet",
  walletName: "comacard.wallet.name",
  walletId: "comacard.wallet.id",
  onboardingDone: "comacard.onboarding.done",
  remoteOrigin: "comacard.remote.origin.v1",
  pendingRelease: "comacard.release.pending.v1",
  e2eConnected: "comacard.e2e.connected",
} as const;

let done = false;

/**
 * Idempotent and safe to call from anywhere, including during a render on the server, where there
 * is no `localStorage` at all. A browser with storage disabled throws on access rather than
 * returning null, so every touch is guarded: failing to migrate has to cost the old value, never
 * the page.
 */
export function migrateStorageKeys(): void {
  if (done || typeof window === "undefined") return;
  done = true;
  try {
    for (const [from, to] of Object.entries(MOVED)) {
      const value = window.localStorage.getItem(from);
      if (value === null) continue;
      if (window.localStorage.getItem(to) === null) window.localStorage.setItem(to, value);
      window.localStorage.removeItem(from);
    }
  } catch {
    // Storage unavailable. The app reads every one of these defensively already.
  }
}
