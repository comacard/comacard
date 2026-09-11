export type Hex = `0x${string}`;

/** Mirrors `INativeQueryVerifier.MerkleProofEntry`. */
export interface MerkleProofEntry {
  hash: Hex;
  isLeft: boolean;
}

/**
 * The exact argument list `ASCBase.execute` expects. Keeping it in one place
 * means the worker, the tests and the contract bindings cannot drift apart.
 */
export interface InclusionProof {
  chainKey: number;
  blockHeight: bigint;
  encodedTransaction: Hex;
  merkleRoot: Hex;
  siblings: MerkleProofEntry[];
  lowerEndpointDigest: Hex;
  continuityRoots: Hex[];
}

/**
 * Discriminator passed to `ASCBase.execute`, routed in `_processAndEmitEvent`.
 *
 * These are ordinals of the `CreditAction` enum in `contracts/src/types/
 * CreditTypes.sol` and must match it exactly — the contract reverts with
 * `UnknownAction` on anything else, and a wrong ordinal here silently maps a
 * proof onto the wrong handler. `action-parity.test.ts` reads the Solidity enum
 * and fails if the two ever drift apart.
 */
export const ASC_ACTION = {
  collateralLocked: 0,
  collateralUnlocked: 1,
  historyImported: 2,
  tokenLocked: 3,
  tokenUnlocked: 4,
} as const;

export type AscAction = (typeof ASC_ACTION)[keyof typeof ASC_ACTION];
