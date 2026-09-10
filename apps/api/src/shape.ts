/** Pure shaping of upstream data. No env, no I/O, so it is trivially testable. */
import type { IndexedAccount } from "./sources";

export type KycStatus = { status: string; verified: boolean; sessionId: string | null };

const WEI = 10n ** 18n;

/** "1.2345" from wei, four decimals, no float in between. */
export function formatCtc(wei: bigint): string {
  const whole = wei / WEI;
  const frac = ((wei % WEI) * 10_000n) / WEI;
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

export type CardState =
  | { active: true; spendable: string }
  | { active: false; spendable: "0"; reason: "kyc_required" | "overdue" | "no_credit" };

/**
 * Whether the card can be used, and why not. Order matters: an unverified
 * wallet is told about KYC before it is told about credit, because that is the
 * step it can actually do something about.
 */
export function cardState(kyc: KycStatus, account: IndexedAccount | null, now: number): CardState {
  if (!kyc.verified) return { active: false, spendable: "0", reason: "kyc_required" };
  const dueAt = Number(account?.dueAt ?? 0);
  if (account && BigInt(account.drawn) > 0n && dueAt > 0 && now > dueAt) {
    return { active: false, spendable: "0", reason: "overdue" };
  }
  const available = BigInt(account?.available ?? 0);
  if (available === 0n) return { active: false, spendable: "0", reason: "no_credit" };
  return { active: true, spendable: available.toString() };
}

export const isAddress = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
