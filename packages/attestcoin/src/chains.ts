/**
 * Attestcoin (formerly Universal Smart Contracts) reads *transactions and their
 * event logs* from a source chain and proves them on Creditcoin. It cannot read
 * balances or contract storage — see `EvmV1Decoder`, which exposes only
 * transaction fields, receipt fields and logs.
 *
 * Source-chain coverage is narrow today, so anything built on it has to fit
 * inside these two chains.
 */
export const CHAIN_KEY = {
  /** Ethereum Sepolia — where we deploy and lock collateral. */
  sepolia: 1,
  /** Ethereum Mainnet — read-only source of real credit history. */
  mainnet: 3,
} as const;

export type ChainKey = (typeof CHAIN_KEY)[keyof typeof CHAIN_KEY];

/** Fixed addresses on Creditcoin CC3. */
export const PRECOMPILE = {
  blockProver: "0x0000000000000000000000000000000000000FD2",
  chainInfo: "0x0000000000000000000000000000000000000fd3",
} as const;

export const CC3_TESTNET = {
  rpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
  proofBuilderUrl: "https://proof-gen-api.cc3-testnet.creditcoin.network",
  evmV1DecoderLibrary: "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f",
} as const;

/**
 * Continuity proofs shorten when a transaction is still recent: attestations
 * are kept densely for a while, then thinned to checkpoints every 1000 blocks.
 * Proving a fresh transaction costs ~2.6e-5 CTC; the same one a day later costs
 * ~3.1e-4 CTC. Prove early where the flow allows it.
 */
export const RECENT_PROOF_WINDOW_SECONDS = 24 * 60 * 60;
