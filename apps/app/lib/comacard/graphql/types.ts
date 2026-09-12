/**
 * Result shapes for `queries.ts`, re-declared rather than generated.
 *
 * Every numeric field is a **decimal string**, because they are `BigInt!` in the schema and wei
 * does not survive `Number()` above about 9e15. Convert with `BigInt(...)` at the point of use, and
 * never with `Number(...)`. `timestamp`, `blockNumber` and the counters are strings for the same
 * reason even where the value is small today.
 */

export type IndexedAccount = {
  id: string;
  collateral: string;
  drawn: string;
  pendingRelease: string;
  provenNonce: string;
  score: string;
  creditLimit: string;
  available: string;
  cycleCount: number;
  repayCount: number;
  defaultCount: number;
  totalDrawn: string;
  totalRepaid: string;
  dueAt: string;
  firstSeenAt: string;
  lastActiveAt: string;
};

/** What an Attestcoin proof carried when it landed on Creditcoin. */
export type AttestationKind = "collateral_credited" | "collateral_released" | "history_imported";

export type Attestation = {
  /** The Attestcoin queryId. Unique per proof, which is what makes replays detectable. */
  id: string;
  kind: AttestationKind;
  amount: string;
  provenNonce: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
};

export type CollateralLock = {
  id: string;
  amount: string;
  nonce: string;
  released: boolean;
  blockNumber: string;
  timestamp: string;
  txHash: string;
};

export type Draw = {
  id: string;
  amount: string;
  outstandingAfter: string;
  dueAt: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
};

export type Repayment = {
  id: string;
  amount: string;
  outstandingAfter: string;
  /** True only when this repayment cleared the balance, which is the one that scores a cycle. */
  settled: boolean;
  blockNumber: string;
  timestamp: string;
  txHash: string;
};

export type DefaultEvent = {
  id: string;
  writtenOff: string;
  collateralSeized: string;
  blockNumber: string;
  timestamp: string;
  txHash: string;
};

export type Protocol = {
  accounts: number;
  totalCollateral: string;
  outstanding: string;
  lifetimeDrawn: string;
  lifetimeRepaid: string;
  lifetimeDefaulted: string;
  defaultCount: number;
};

export type AccountWithProofsResult = {
  Account: IndexedAccount[];
  Attestation: Attestation[];
};
export type CollateralLocksResult = { CollateralLock: CollateralLock[] };
export type LatestCreditAttestationResult = {
  Attestation: Pick<Attestation, "id" | "amount" | "blockNumber" | "timestamp" | "txHash">[];
};
export type CreditHistoryResult = {
  Draw: Draw[];
  Repayment: Repayment[];
  Default: DefaultEvent[];
};
export type ProtocolResult = { Protocol: Protocol[] };

export type WalletTransactionsResult = {
  Draw: Pick<Draw, "id" | "amount" | "outstandingAfter" | "dueAt" | "timestamp" | "txHash">[];
  Repayment: Pick<
    Repayment,
    "id" | "amount" | "outstandingAfter" | "settled" | "timestamp" | "txHash"
  >[];
  CollateralLock: Pick<
    CollateralLock,
    "id" | "amount" | "nonce" | "released" | "timestamp" | "txHash"
  >[];
  Default: Pick<DefaultEvent, "id" | "writtenOff" | "collateralSeized" | "timestamp" | "txHash">[];
  Attestation: Pick<Attestation, "id" | "kind" | "amount" | "timestamp" | "txHash">[];
};
