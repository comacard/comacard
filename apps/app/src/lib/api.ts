export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api-production-1141.up.railway.app";

export type Account = {
  wallet: string;
  kyc: { status: string; verified: boolean; sessionId: string | null };
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
  card:
    | { active: true; spendable: string; spendableCtc: string }
    | {
        active: false;
        spendable: "0";
        spendableCtc: string;
        reason: "kyc_required" | "overdue" | "no_credit";
      };
};

export type ActivityItem = {
  kind: "draw" | "repayment" | "collateral_locked" | "collateral_unlocked" | "default";
  chain: "creditcoin" | "sepolia";
  id: string;
  timestamp: string;
  txHash: string;
  amount?: string;
  writtenOff?: string;
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
