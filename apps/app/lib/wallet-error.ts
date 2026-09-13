// Error helpers, kept out of `wallet.ts` so the UI and the tests can import them without pulling
// in the connector stack, which does not load under the vitest jsdom environment.

/** Code a wallet picker rejects with when the user dismisses it. */
export const USER_CLOSED_MODAL = -1;

/**
 * Wallet pickers reject with plain `{ code, message }` objects rather than
 * Error instances: an unhandled one surfaces to the user as the useless
 * "[object Object]". Normalising at the wallet boundary gives callers a real
 * Error with a readable message and a `code` to special-case cancellation.
 */
export class WalletError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export function toWalletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  if (e && typeof e === "object" && "message" in e) {
    const { message, code } = e as { message: unknown; code?: unknown };
    return new WalletError(String(message), typeof code === "number" ? code : undefined);
  }
  return new WalletError(typeof e === "string" && e ? e : "Wallet request failed");
}
