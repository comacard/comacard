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

/** Discriminator passed to `ASCBase.execute`, routed in `_processAndEmitEvent`. */
export const ASC_ACTION = {
  collateralLocked: 0,
  collateralUnlocked: 1,
  repaid: 2,
  yieldAccrued: 3,
  historyImported: 4,
} as const;

export type AscAction = (typeof ASC_ACTION)[keyof typeof ASC_ACTION];
