/**
 * The three places the API reads from. None of them is written to here: the
 * chain is the source of truth, the indexer is its queryable shadow, and the
 * KYC service owns identity. This file only fetches and shapes.
 */

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

/** Everything that points somewhere comes from the environment. No fallbacks:
 *  a wrong address failing loudly beats a stale one working quietly. */
export const env = {
  indexerUrl: must("INDEXER_URL"),
  creditcoinRpc: must("CREDITCOIN_RPC_URL"),
  kycUrl: must("KYC_URL"),
  creditLine: must("ASC_CREDIT_LINE_ADDRESS"),
  stakingAdapter: must("STAKING_ADAPTER_ADDRESS"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  cardSecret: must("CARD_SECRET"),
};

// ---------------------------------------------------------------- indexer

export async function indexer<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(env.indexerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`indexer ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(`indexer: ${body.errors[0]?.message}`);
  if (!body.data) throw new Error("indexer: empty response");
  return body.data;
}

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
  dueAt: string;
  firstSeenAt: string;
  lastActiveAt: string;
};

export const ACCOUNT_FIELDS =
  "id collateral drawn pendingRelease provenNonce score creditLimit available cycleCount repayCount defaultCount dueAt firstSeenAt lastActiveAt";

// ---------------------------------------------------------------- chain

const SELECTOR = {
  idleBalance: "0xb1bbb310",
  totalAssets: "0x01e1d114",
  limitOf: "0x546a2ca4",
  availableOf: "0xd546da90",
  collateralPrice: "0x5891de72",
} as const;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(env.creditcoinRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`rpc: ${body.error.message}`);
  return body.result as T;
}

export const balanceOf = async (address: string): Promise<bigint> =>
  BigInt(await rpc<string>("eth_getBalance", [address, "latest"]));

const call = async (to: string, selector: string): Promise<bigint> =>
  BigInt(await rpc<string>("eth_call", [{ to, data: selector }, "latest"]));

const pad = (address: string) => address.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/**
 * Limit and available credit straight off the contract. The indexer's copy is
 * as of the account's last transaction; repricing collateral moves every
 * limit at once without an event per account, so only the chain is current.
 */
export async function liveCredit(wallet: string) {
  const [limit, available] = await Promise.all([
    call(env.creditLine, SELECTOR.limitOf + pad(wallet)),
    call(env.creditLine, SELECTOR.availableOf + pad(wallet)),
  ]);
  return { limit, available };
}

export const collateralPrice = () => call(env.creditLine, SELECTOR.collateralPrice);

/** Live view of the staking adapter: what is idle vs bonded right now. */
export async function stakingAdapterState() {
  const [idle, totalAssets] = await Promise.all([
    call(env.stakingAdapter, SELECTOR.idleBalance),
    call(env.stakingAdapter, SELECTOR.totalAssets),
  ]);
  return { idle, totalAssets };
}

// ---------------------------------------------------------------- kyc

import type { KycStatus } from "./shape";

export type { KycStatus };

/** Starts (or resumes) a Didit session; the app opens the returned URL. */
export async function kycStart(wallet: string): Promise<{ sessionId: string; url: string }> {
  const res = await fetch(`${env.kycUrl}/kyc/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet }),
  });
  if (!res.ok) throw new Error(`kyc ${res.status}`);
  return (await res.json()) as { sessionId: string; url: string };
}

export async function kycStatus(wallet: string): Promise<KycStatus> {
  const res = await fetch(`${env.kycUrl}/kyc/status/${wallet}`);
  if (!res.ok) throw new Error(`kyc ${res.status}`);
  return (await res.json()) as KycStatus;
}
