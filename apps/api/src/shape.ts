/** Pure shaping of upstream data. No env, no I/O, so it is trivially testable. */
import type { IndexedAccount } from "./sources";

export type KycStatus = {
  status: string;
  verified: boolean;
  sessionId: string | null;
  /** OCR'd from the identity document by the KYC service. Null until a decision has been stored. */
  name: string | null;
  updatedAt: number | null;
};

const WEI = 10n ** 18n;

/** "1.2345" from wei, four decimals, no float in between. */
export function formatCtc(wei: bigint): string {
  const whole = wei / WEI;
  const frac = ((wei % WEI) * 10_000n) / WEI;
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

export type CardState =
  | { active: true; spendable: string }
  | { active: false; spendable: "0"; reason: "kyc_required" | "overdue" };

/**
 * A card exists and is active the moment KYC clears, whether or not the wallet
 * has earned a limit yet. Only an overdue draw switches it off. Spendable is
 * simply what the credit line will honour right now, which may be zero.
 */
export function cardState(
  kyc: KycStatus,
  account: IndexedAccount | null,
  available: bigint,
  now: number,
): CardState {
  if (!kyc.verified) return { active: false, spendable: "0", reason: "kyc_required" };
  const dueAt = Number(account?.dueAt ?? 0);
  if (account && BigInt(account.drawn) > 0n && dueAt > 0 && now > dueAt) {
    return { active: false, spendable: "0", reason: "overdue" };
  }
  return { active: true, spendable: available.toString() };
}

export const isAddress = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
