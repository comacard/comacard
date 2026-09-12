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

import { decodeAccount, type RemoteDepositRow } from "./shape";

export const REMOTE_DEPOSIT_FIELDS =
  "id account amount sequence lockedAt lockTxHash creditedAt creditTxHash asset { wormholeChainId token decimals }";

/**
 * Cross-chain deposits for one wallet, newest first.
 *
 * Deliberately isolated from every other read. `RemoteDeposit` only exists on
 * an indexer deployment newer than the one INDEXER_URL may still point at, and
 * an unknown field is a query-level error that would otherwise take the whole
 * card screen down with it. Failing soft means an empty list, which is also
 * what a wallet with no cross-chain deposits looks like, so the failure is
 * logged rather than swallowed.
 */
export async function remoteDeposits(wallet: string): Promise<RemoteDepositRow[]> {
  try {
    const data = await indexer<{ RemoteDeposit: RemoteDepositRow[] }>(
      `query($id:String!){ RemoteDeposit(where:{account:{_eq:$id}},order_by:{lockedAt:desc},limit:100){ ${REMOTE_DEPOSIT_FIELDS} } }`,
      { id: wallet },
    );
    return data.RemoteDeposit;
  } catch (err) {
    console.warn(`remote deposits unavailable: ${(err as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------- chain

const SELECTOR = {
  idleBalance: "0xb1bbb310",
  totalAssets: "0x01e1d114",
  limitOf: "0x546a2ca4",
  availableOf: "0xd546da90",
  scoreOf: "0x133af456",
  accountOf: "0x8086b8ba",
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

/** One JSON-RPC round trip for several eth_calls against the same contract. */
async function batchCall(to: string, datas: string[]): Promise<string[]> {
  const res = await fetch(env.creditcoinRpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      datas.map((data, id) => ({
        jsonrpc: "2.0",
        id,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      })),
    ),
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const body = (await res.json()) as { id: number; result?: string; error?: { message: string } }[];
  const out: string[] = [];
  for (const entry of body) {
    if (entry.error) throw new Error(`rpc: ${entry.error.message}`);
    out[entry.id] = entry.result as string;
  }
  return out;
}

/**
 * The whole credit position, straight off the contract.
 *
 * Nothing here comes from the indexer any more. Its copy is as of the
 * account's last transaction, and repricing collateral moves every limit at
 * once without an event per account, so it lags by design. Debt is the case
 * that actually bites: `repay()` reverts rather than refunds when sent more
 * than is owed, so a stale `drawn` fails the one action the product is about.
 */
export async function liveCredit(wallet: string) {
  const w = pad(wallet);
  const [limit, available, score, account] = await batchCall(env.creditLine, [
    SELECTOR.limitOf + w,
    SELECTOR.availableOf + w,
    SELECTOR.scoreOf + w,
    SELECTOR.accountOf + w,
  ]);
  return {
    limit: BigInt(limit as string),
    available: BigInt(available as string),
    score: Number(BigInt(score as string)),
    account: decodeAccount(account as string),
  };
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
