/**
 * Read surface of the Comacard backend (`apps/api`), which is a different service from the vault
 * backend `lib/api/` talks to. Two clients, two env vars, deliberately: `apps/api` serves the credit
 * line (score, limit, KYC, card), the vault backend serves buckets and yield. Pointing one at the
 * other would 404 every read.
 *
 * Same three disciplines as `lib/api/client.ts`, for the same reasons:
 *   1. Never throws. Callers get a `Result`, so a dead backend degrades a screen instead of blanking
 *      it, and nobody can forget a `try`.
 *   2. Env-gated. With `NEXT_PUBLIC_COMACARD_API_URL` unset no request is issued at all, which is
 *      what keeps vitest and Playwright offline.
 *   3. Amounts stay strings. They are wei, and `Number()` loses precision above ~9e15.
 */

const RAW_BASE_URL = process.env.NEXT_PUBLIC_COMACARD_API_URL ?? "";

/** Origin of `apps/api`, without a trailing slash. `""` when unconfigured. */
export const COMACARD_API_URL = RAW_BASE_URL.replace(/\/+$/, "");

export const comacardApiEnabled = (): boolean => COMACARD_API_URL !== "";

const TIMEOUT_MS = 10_000;

export type Result<T> = { ok: true; value: T } | { ok: false; code: string; message: string };

/** Why the card cannot be used. Mirrors `cardState` in `apps/api/src/shape.ts`. */
export type CardReason = "kyc_required" | "overdue" | "no_credit";

export type KycState = {
  status: string;
  verified: boolean;
  sessionId: string | null;
};

/**
 * `card.number` / `card.expiry` / `card.cvv` are **not served yet**: issuance is being built
 * separately. They are optional here so the screen can render the unissued state truthfully rather
 * than inventing digits, and so this type does not have to change when the endpoint lands.
 */
export type CardState = {
  active: boolean;
  spendable: string;
  spendableCtc: string;
  reason?: CardReason;
  /** True the moment KYC clears. The card is derived, so there is nothing to wait for after that. */
  issued?: boolean;
  /**
   * MASKED on `GET /account/:wallet` ("•••• •••• •••• 6363"), full only on
   * `GET /account/:wallet/card`. The split is deliberate on the backend: a list screen has no
   * business holding a PAN.
   */
  number?: string;
  /** 12 digits, the one number a person would read out to receive money. Safe to show in full. */
  accountNumber?: string;
  expiry?: string;
  cvv?: string;
  holder?: string;
  issuedAt?: number;
};

export type CreditState = {
  score: number;
  limitCtc: string;
  availableCtc: string;
  drawnCtc: string;
  collateral: string;
  dueAt: number;
};

export type ComacardAccount = {
  wallet: string;
  kyc: KycState;
  balance: { wei: string; ctc: string };
  credit: CreditState | null;
  card: CardState;
};

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  if (!comacardApiEnabled()) {
    return { ok: false, code: "disabled", message: "NEXT_PUBLIC_COMACARD_API_URL is not set" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${COMACARD_API_URL}${path}`, { ...init, signal: controller.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, code: "http", message };
    }
    if (body === null) return { ok: false, code: "parse", message: "response was not JSON" };
    return { ok: true, value: body as T };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "timeout" : "unavailable",
      message: aborted ? "the backend did not answer in time" : "could not reach the backend",
    };
  } finally {
    clearTimeout(timer);
  }
}

export const getAccount = (wallet: string): Promise<Result<ComacardAccount>> =>
  request<ComacardAccount>(`/account/${wallet}`);

/** Opens (or resumes) a Didit session. The app sends the user to `url`; the verdict arrives later
 *  through Didit's webhook, so the caller has to re-read `getAccount` to learn the outcome. */
export const startKyc = (wallet: string): Promise<Result<{ sessionId: string; url: string }>> =>
  request<{ sessionId: string; url: string }>(`/account/${wallet}/kyc`, { method: "POST" });

/**
 * The full card: unmasked PAN, CVV, expiry.
 *
 * A second endpoint on purpose. `GET /account/:wallet` only ever returns the masked number and no
 * CVV at all, so a screen that lists cards never holds a PAN. Call this only when the holder asks
 * to see it, not on page load.
 *
 * 404s until KYC is Approved, which is the backend refusing to invent a card for an unverified
 * person rather than an error to retry.
 */
export type FullCard = {
  wallet: string;
  number: string;
  masked: string;
  accountNumber: string;
  cvv: string;
  expiry: string;
  expiresAt: number;
  issuedAt: number;
  active: boolean;
  reason?: CardReason;
  spendable: string;
  spendableCtc: string;
};

export const getCard = (wallet: string): Promise<Result<FullCard>> =>
  request<FullCard>(`/account/${wallet}/card`);
