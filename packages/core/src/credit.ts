import type { Idr } from "./money.js";

/**
 * Attestcoin proves transactions and their event logs — never balances.
 * Every input to a credit decision must therefore be an observed *event*,
 * which is why the score is built from behaviour rather than net worth.
 */
export type AttestedEventKind =
  | "collateral_locked"
  | "collateral_unlocked"
  | "repaid"
  | "borrowed"
  | "yield_accrued";

export interface AttestedEvent {
  kind: AttestedEventKind;
  /** Creditcoin-internal source chain id: 1 = Sepolia, 3 = Ethereum Mainnet. */
  chainKey: number;
  /** Source chain block the proof was anchored to. */
  blockHeight: number;
  /** Seconds since epoch, from the source chain block. */
  timestamp: number;
  /** Minor units of the event's asset. Zero for events that carry no amount. */
  amount: bigint;
  txHash: `0x${string}`;
}

export interface CreditProfile {
  score: number;
  /** Percent of collateral value required to back the line, 80–150. */
  collateralizationRatio: number;
  limit: Idr;
}

const MIN_RATIO = 80;
const MAX_RATIO = 150;
const MONTH = 30 * 24 * 60 * 60;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Deterministic and deliberately legible: a judge (or a borrower) can read the
 * inputs off the chain and recompute the limit by hand.
 *
 * ponytail: flat weighted sum, no risk model. Swap in a real hazard model only
 * once there is repayment data to fit it against.
 */
export function scoreProfile(events: readonly AttestedEvent[], now: number): number {
  const repaid = events.filter((e) => e.kind === "repaid");
  const borrowed = events.filter((e) => e.kind === "borrowed");

  // Depth: how long the wallet has been observably active, capped at 24 months.
  const oldest = events.reduce((min, e) => Math.min(min, e.timestamp), now);
  const months = clamp((now - oldest) / MONTH, 0, 24);
  const depth = (months / 24) * 40;

  // Track record: repayments completed against draws taken.
  const ratio = borrowed.length === 0 ? 0 : repaid.length / borrowed.length;
  const record = clamp(ratio, 0, 1) * 40;

  // Consistency: distinct repayments, capped at 10.
  const consistency = (Math.min(repaid.length, 10) / 10) * 20;

  return Math.round(clamp(depth + record + consistency, 0, 100));
}

export function profileFrom(
  events: readonly AttestedEvent[],
  collateral: Idr,
  now: number,
): CreditProfile {
  const score = scoreProfile(events, now);
  const collateralizationRatio = MAX_RATIO - (score / 100) * (MAX_RATIO - MIN_RATIO);
  const limit = (collateral * 100n) / BigInt(Math.round(collateralizationRatio));
  return { score, collateralizationRatio, limit };
}
