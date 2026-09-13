import type { Hex } from "viem";
import { STORAGE } from "../storage";

/**
 * A release that has left Creditcoin and not yet arrived on the far chain.
 *
 * **The gap this exists to cover, found on a live withdrawal.** `requestRelease` debits the hub
 * immediately, and `releasable` on the far vault only becomes non-zero once somebody submits the
 * guardians' signature. Between those two the holder owns the money and no contract reports it:
 * `credited` is 0 and `releasable` is 0. The withdraw screen read both, concluded "Nothing of yours
 * is held on BSC Testnet", and hid the very button that finishes the withdrawal. Axel hit this on
 * his own 0.01 BNB, mid-flow, with the VAA already signed and waiting.
 *
 * The indexer does record the request, but it is a second system with its own lag, and this is the
 * one moment the screen is being stared at. So the request is remembered here the instant its
 * receipt lands, from data read out of that receipt, and the screen stops depending on anything
 * else having caught up.
 *
 * **Nothing here is trusted for money.** The entry carries a sequence and an amount, which are used
 * to fetch a signature the relay verifies anyway, and to render a figure. A forged or stale entry
 * produces a fetch that returns nothing or a transaction the relay rejects. It cannot move funds,
 * which is why it is safe to keep somewhere a person can edit.
 */

export type PendingRelease = {
  /** `keccak256(chainId, token)`, the same id the withdraw route is addressed by. */
  assetId: string;
  /** Wormhole's sequence for the release message, from the request's own receipt. */
  sequence: string;
  /** Base units of the asset, for the figure on screen while nothing else reports it. */
  amount: string;
  /** Epoch ms, so a request that never got relayed can be aged out rather than kept forever. */
  at: number;
};

const KEY = STORAGE.pendingRelease;

/** A week. Long past the twenty minutes an L2 release takes, short enough to not be archaeology. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * `LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8)`
 *
 * The sequence is the first word of the data, not a topic: only `sender` is indexed. Reading it off
 * the receipt rather than from a return value is the only way, because `writeContractAsync` hands
 * back a hash and a contract's return value is not in a receipt at all.
 */
const LOG_MESSAGE_PUBLISHED = "0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2";

export function sequenceFromReceipt(
  logs: readonly { topics: readonly Hex[]; data: Hex }[],
): bigint | null {
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== LOG_MESSAGE_PUBLISHED) continue;
    const word = log.data.slice(2, 66);
    if (word.length === 64) return BigInt(`0x${word}`);
  }
  return null;
}

export function readPending(): PendingRelease[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingRelease[];
    if (!Array.isArray(parsed)) return [];

    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(
      (entry) =>
        typeof entry?.assetId === "string" &&
        typeof entry?.sequence === "string" &&
        typeof entry?.amount === "string" &&
        typeof entry?.at === "number" &&
        entry.at > cutoff,
    );
  } catch {
    // `localStorage` throws outright in some privacy modes. A withdraw screen that failed to render
    // because a cache read was refused would be a far worse bug than one that shows no figure.
    return [];
  }
}

export function rememberPending(entry: Omit<PendingRelease, "at">): void {
  try {
    const rest = readPending().filter(
      (e) => e.assetId.toLowerCase() !== entry.assetId.toLowerCase(),
    );
    write([...rest, { ...entry, at: Date.now() }]);
  } catch {
    // Full or refused. The screen falls back to the indexer, which is where it was before this.
  }
}

export function forgetPending(assetId: string): void {
  try {
    write(readPending().filter((e) => e.assetId.toLowerCase() !== assetId.toLowerCase()));
  } catch {
    // Nothing to do. A stale entry ages out on its own.
  }
}

/**
 * The store side, so a component can read this without a `setState` inside an effect.
 *
 * `useSyncExternalStore` is what React offers for exactly this shape, and it needs a snapshot that
 * keeps its identity between calls: returning a fresh array every time is an infinite render loop.
 * So the parsed value is cached and only replaced when the underlying string changes.
 */
let cachedRaw: string | null = null;
let cachedValue: PendingRelease[] = [];
const listeners = new Set<() => void>();

function write(entries: PendingRelease[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(entries));
  for (const listener of listeners) listener();
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires for other tabs only, which is the half this file cannot notify itself.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function pendingSnapshot(): PendingRelease[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cachedValue;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readPending();
  }
  return cachedValue;
}

/** Server render: there is no storage, and an empty array keeps its identity across calls. */
export const EMPTY_PENDING: PendingRelease[] = [];

export const pendingFor = (entries: PendingRelease[], assetId: string): PendingRelease | null =>
  entries.find((e) => e.assetId.toLowerCase() === assetId.toLowerCase()) ?? null;
