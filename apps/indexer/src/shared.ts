import type { Entity } from "envio";

export const PROTOCOL_ID = "comacard";
export const ADAPTER_ID = "ctc-staking-adapter";

const ZERO = 0n;

/**
 * An account can appear from either chain — a lock on Sepolia or a proof
 * landing on Creditcoin — so whichever arrives first has to create the row.
 */
export function emptyAccount(id: string, timestamp: bigint): Entity<"Account"> {
  return {
    id,
    collateral: ZERO,
    drawn: ZERO,
    pendingRelease: ZERO,
    provenNonce: ZERO,
    score: ZERO,
    creditLimit: ZERO,
    available: ZERO,
    cycleCount: 0,
    repayCount: 0,
    defaultCount: 0,
    totalDrawn: ZERO,
    totalRepaid: ZERO,
    totalWrittenOff: ZERO,
    dueAt: ZERO,
    firstSeenAt: timestamp,
    lastActiveAt: timestamp,
  };
}

export function emptyProtocol(): Entity<"Protocol"> {
  return {
    id: PROTOCOL_ID,
    accounts: 0,
    totalCollateral: ZERO,
    outstanding: ZERO,
    lifetimeDrawn: ZERO,
    lifetimeRepaid: ZERO,
    lifetimeDefaulted: ZERO,
    defaultCount: 0,
  };
}

export function emptyYieldPosition(timestamp: bigint): Entity<"YieldPosition"> {
  return {
    id: ADAPTER_ID,
    deployedPrincipal: ZERO,
    accruedRewards: ZERO,
    totalDelegated: ZERO,
    totalReturned: ZERO,
    lastUpdatedAt: timestamp,
  };
}

/** Stable id for a row that stands for exactly one log. */
export const logId = (chainId: number, txHash: string, logIndex: number): string =>
  `${chainId}-${txHash}-${logIndex}`;

/** Subtraction that cannot go negative — totals are unsigned in the schema. */
export const minus = (a: bigint, b: bigint): bigint => (a > b ? a - b : ZERO);
