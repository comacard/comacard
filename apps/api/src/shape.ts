/** Pure shaping of upstream data. No env, no I/O, so it is trivially testable. */

export type KycStatus = {
  status: string;
  verified: boolean;
  sessionId: string | null;
  /** OCR'd from the identity document by the KYC service. Null until a decision is stored. */
  name: string | null;
  updatedAt: number | null;
};

/** "1.2345" from base units, truncated, with no float in between. */
export function formatUnits(amount: bigint, decimals: number, places = 4): string {
  const unit = 10n ** BigInt(decimals);
  const scale = 10n ** BigInt(places);
  const whole = amount / unit;
  const frac = ((amount % unit) * scale) / unit;
  return `${whole}.${frac.toString().padStart(places, "0")}`;
}

export const formatCtc = (wei: bigint): string => formatUnits(wei, 18);

/**
 * Wormhole chain ids are their own number space, unrelated to EVM chain ids:
 * 10004 is Base Sepolia and so is 84532. The indexer stores the Wormhole one,
 * so that is what arrives here.
 */
export const REMOTE_CHAINS: Record<number, { name: string; explorer: string }> = {
  4: { name: "BSC Testnet", explorer: "https://testnet.bscscan.com" },
  6: { name: "Avalanche Fuji", explorer: "https://testnet.snowtrace.io" },
  10003: { name: "Arbitrum Sepolia", explorer: "https://sepolia.arbiscan.io" },
  10004: { name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
  10005: { name: "Optimism Sepolia", explorer: "https://sepolia-optimism.etherscan.io" },
};

export const NETWORK = {
  creditcoin: { name: "Creditcoin", explorer: "https://creditcoin-testnet.blockscout.com" },
  sepolia: { name: "Ethereum Sepolia", explorer: "https://sepolia.etherscan.io" },
} as const;

export const txUrl = (explorer: string, hash: string) => `${explorer}/tx/${hash}`;

/**
 * How long the Wormhole guardians take to sign, nominally.
 *
 * The vault publishes at finalized consistency and an L2 finalizes against
 * Ethereum, so this is minutes rather than seconds. One measured delivery took
 * 1049s. It is a guide for the waiting screen, not a deadline: past it the
 * deposit is reported as slow, never as failed.
 */
export const FINALITY_WAIT_SECONDS = 900;

export type RemoteDepositRow = {
  id: string;
  account: string;
  amount: string;
  sequence: string;
  lockedAt: string;
  lockTxHash: string;
  creditedAt: string | null;
  creditTxHash: string | null;
  asset: { wormholeChainId: number; token: string; decimals: number };
};

/**
 * A cross-chain deposit as the card app should read it.
 *
 * `credited` is the whole story: until the message is delivered the funds are
 * locked on the far chain and the limit has not moved, which looks like a
 * broken deposit unless the screen says otherwise.
 */
export function remoteDepositView(row: RemoteDepositRow, now: number) {
  const chain = REMOTE_CHAINS[row.asset.wormholeChainId];
  const lockedAt = Number(row.lockedAt);
  const credited = row.creditedAt !== null;
  const elapsedSeconds = Math.max(0, now - lockedAt);
  return {
    id: row.id,
    chain: chain?.name ?? `Wormhole chain ${row.asset.wormholeChainId}`,
    wormholeChainId: row.asset.wormholeChainId,
    token: row.asset.token,
    decimals: row.asset.decimals,
    amount: row.amount,
    amountFormatted: formatUnits(BigInt(row.amount), row.asset.decimals),
    sequence: row.sequence,
    credited,
    lockedAt,
    lockTxHash: row.lockTxHash,
    lockTxUrl: chain ? txUrl(chain.explorer, row.lockTxHash) : null,
    creditedAt: row.creditedAt === null ? null : Number(row.creditedAt),
    creditTxHash: row.creditTxHash,
    creditTxUrl: row.creditTxHash ? txUrl(NETWORK.creditcoin.explorer, row.creditTxHash) : null,
    elapsedSeconds,
    waitSeconds: FINALITY_WAIT_SECONDS,
    /** Still waiting, and longer than usual. Not a failure. */
    slow: !credited && elapsedSeconds > FINALITY_WAIT_SECONDS,
  };
}

export type LiveAccount = {
  collateral: bigint;
  drawn: bigint;
  pendingRelease: bigint;
  drawnAt: number;
  dueAt: number;
  provenNonce: bigint;
  cycleCount: number;
  repayCount: number;
  defaultCount: number;
};

/**
 * `accountOf` returns a struct whose members are all value types, so the ABI
 * encodes it inline: nine words with no offset. Decoded positionally against
 * CreditAccount in contracts/src/types/CreditTypes.sol, and the word count is
 * checked first so a changed struct fails loudly here rather than quietly
 * reading the wrong field as somebody's debt.
 */
export function decodeAccount(data: string): LiveAccount {
  const hex = data.replace(/^0x/, "");
  if (hex.length !== 9 * 64) {
    throw new Error(`accountOf: expected 9 words, got ${hex.length / 64}`);
  }
  const word = (i: number) => BigInt(`0x${hex.slice(i * 64, (i + 1) * 64)}`);
  return {
    collateral: word(0),
    drawn: word(1),
    pendingRelease: word(2),
    drawnAt: Number(word(3)),
    dueAt: Number(word(4)),
    provenNonce: word(5),
    cycleCount: Number(word(6)),
    repayCount: Number(word(7)),
    defaultCount: Number(word(8)),
  };
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
  position: { drawn: bigint; dueAt: number },
  available: bigint,
  now: number,
): CardState {
  if (!kyc.verified) return { active: false, spendable: "0", reason: "kyc_required" };
  if (position.drawn > 0n && position.dueAt > 0 && now > position.dueAt) {
    return { active: false, spendable: "0", reason: "overdue" };
  }
  return { active: true, spendable: available.toString() };
}

export const isAddress = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
