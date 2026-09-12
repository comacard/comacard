/**
 * Next inlines `process.env.NEXT_PUBLIC_*` only when the name is written out
 * literally, so callers pass the value, not the key. A missing one fails at
 * module load, on the server, before any user sees a broken page.
 */
export function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const API_URL = required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL);

export type Account = {
  wallet: string;
  kyc: {
    status: string;
    verified: boolean;
    sessionId: string | null;
    name: string | null;
    updatedAt: number | null;
  };
  balance: { wei: string; ctc: string };
  credit: {
    score: number;
    limit: string;
    available: string;
    drawn: string;
    collateral: string;
    dueAt: number;
    cycleCount: number;
    repayCount: number;
    defaultCount: number;
    limitCtc: string;
    availableCtc: string;
    drawnCtc: string;
  } | null;
  pendingDeposits: PendingDeposit[];
  card: {
    active: boolean;
    issued: boolean;
    holder: string | null;
    spendable: string;
    spendableCtc: string;
    reason?: "kyc_required" | "overdue";
    number: string | null;
    accountNumber: string | null;
    expiry: string | null;
    issuedAt: number | null;
  };
};

export type PendingDeposit = {
  id: string;
  chain: string;
  amountFormatted: string;
  lockTxUrl: string | null;
  elapsedSeconds: number;
  waitSeconds: number;
  slow: boolean;
};

export type ActivityItem = {
  kind:
    | "draw"
    | "repayment"
    | "collateral_locked"
    | "collateral_unlocked"
    | "default"
    | "remote_deposit";
  /** Display name now, not a slug: "Creditcoin", "Base Sepolia". */
  chain: string;
  id: string;
  timestamp: string;
  txHash: string;
  txUrl: string | null;
  amount?: string;
  amountFormatted?: string;
  writtenOff?: string;
  pending?: boolean;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as T;
}

export const fetchAccount = (wallet: string) => get<Account>(`/account/${wallet}`);
export const fetchActivity = (wallet: string) =>
  get<{ items: ActivityItem[] }>(`/account/${wallet}/activity`).then((r) => r.items);

export async function startKyc(wallet: string): Promise<{ url: string }> {
  const res = await fetch(`${API_URL}/account/${wallet}/kyc`, { method: "POST" });
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()) as { url: string };
}

export const explorerTx = (chain: ActivityItem["chain"], hash: string) =>
  chain === "sepolia"
    ? `https://sepolia.etherscan.io/tx/${hash}`
    : `https://creditcoin-testnet.blockscout.com/tx/${hash}`;
