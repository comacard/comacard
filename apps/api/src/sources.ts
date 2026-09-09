/**
 * The three places the API reads from. None of them is written to here: the
 * chain is the source of truth, the indexer is its queryable shadow, and the
 * KYC service owns identity. This file only fetches and shapes.
 */

export const env = {
  indexerUrl: process.env.INDEXER_URL ?? "https://indexer.dev.hyperindex.xyz/5d01570/v1/graphql",
  creditcoinRpc: process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
  kycUrl: process.env.KYC_URL ?? "http://localhost:3002",
  creditLine: process.env.ASC_CREDIT_LINE_ADDRESS ?? "0x18052272cC69113DE2b45d2BDB4E1fB287F4E906",
  stakingAdapter:
    process.env.STAKING_ADAPTER_ADDRESS ?? "0xA94218Dbdb142A10e32eF7b494105D27F47f7045",
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

const SELECTOR = { idleBalance: "0xb1bbb310", totalAssets: "0x01e1d114" } as const;

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

/** Live view of the staking adapter: what is idle vs bonded right now. */
export async function stakingAdapterState() {
  const [idle, totalAssets] = await Promise.all([
    call(env.stakingAdapter, SELECTOR.idleBalance),
    call(env.stakingAdapter, SELECTOR.totalAssets),
  ]);
  return { idle, totalAssets };
}

// ---------------------------------------------------------------- kyc

export type KycStatus = { status: string; verified: boolean; sessionId: string | null };

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

// ---------------------------------------------------------------- shaping

const WEI = 10n ** 18n;

/** "1.2345" from wei, four decimals, no float in between. */
export function formatCtc(wei: bigint): string {
  const whole = wei / WEI;
  const frac = ((wei % WEI) * 10_000n) / WEI;
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

export type CardState =
  | { active: true; spendable: string }
  | { active: false; spendable: "0"; reason: "kyc_required" | "overdue" | "no_credit" };

/**
 * Whether the card can be used, and why not. Order matters: an unverified
 * wallet is told about KYC before it is told about credit, because that is the
 * step it can actually do something about.
 */
export function cardState(kyc: KycStatus, account: IndexedAccount | null, now: number): CardState {
  if (!kyc.verified) return { active: false, spendable: "0", reason: "kyc_required" };
  const dueAt = Number(account?.dueAt ?? 0);
  if (account && BigInt(account.drawn) > 0n && dueAt > 0 && now > dueAt) {
    return { active: false, spendable: "0", reason: "overdue" };
  }
  const available = BigInt(account?.available ?? 0);
  if (available === 0n) return { active: false, spendable: "0", reason: "no_credit" };
  return { active: true, spendable: available.toString() };
}

export const isAddress = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
