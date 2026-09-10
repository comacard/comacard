"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { formatEther, parseEther } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  type Account,
  type ActivityItem,
  explorerTx,
  fetchAccount,
  fetchActivity,
  startKyc,
} from "@/lib/api";
import { CREDIT_LINE, creditLineAbi } from "@/lib/creditLine";
import { creditcoinTestnet } from "@/lib/wagmi";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (s: string | number) => new Date(Number(s) * 1000).toLocaleString();

const REASON: Record<string, string> = {
  kyc_required: "Verify your identity and your card is issued instantly",
  overdue: "A draw is past due. Repay to reactivate",
};

export function CardScreen() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (!isConnected || !address) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <h1 className="text-3xl font-semibold">Comacard</h1>
        <p className="text-ink/70">A card sized by what you have repaid, not what you hold.</p>
        {connectors.map((c) => (
          <button
            key={c.uid}
            type="button"
            disabled={connecting}
            onClick={() => connect({ connector: c })}
            className="rounded-full bg-ink px-6 py-3 text-canvas disabled:opacity-50"
          >
            Connect {c.name}
          </button>
        ))}
      </section>
    );
  }

  const wrongChain = chainId !== creditcoinTestnet.id;
  return (
    <>
      <header className="flex items-center justify-between text-sm">
        <span className="font-code">{short(address)}</span>
        <button type="button" onClick={() => disconnect()} className="text-ink/60 underline">
          Disconnect
        </button>
      </header>
      {wrongChain && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: creditcoinTestnet.id })}
          className="rounded-2xl bg-amber-100 px-4 py-3 text-left text-sm text-amber-900"
        >
          Wrong network. Tap to switch to Creditcoin Testnet.
        </button>
      )}
      <Wallet wallet={address.toLowerCase()} canSign={!wrongChain} />
    </>
  );
}

function Wallet({ wallet, canSign }: { wallet: string; canSign: boolean }) {
  const account = useQuery({
    queryKey: ["account", wallet],
    queryFn: () => fetchAccount(wallet),
    refetchInterval: 15_000,
  });
  const activity = useQuery({
    queryKey: ["activity", wallet],
    queryFn: () => fetchActivity(wallet),
    refetchInterval: 30_000,
  });

  if (account.isError) {
    return <p className="rounded-2xl bg-red-100 p-4 text-sm text-red-900">API unreachable.</p>;
  }
  if (!account.data) return <p className="text-ink/60">Loading…</p>;

  return (
    <>
      <Card data={account.data} />
      <Kyc data={account.data} wallet={wallet} />
      <CardDetails data={account.data} />
      {account.data.credit && <Credit data={account.data} />}
      {canSign && account.data.card.active && BigInt(account.data.card.spendable) > 0n && (
        <Actions data={account.data} wallet={wallet} />
      )}
      {canSign &&
        account.data.credit &&
        BigInt(account.data.credit.drawn) > 0n &&
        !(account.data.card.active && BigInt(account.data.card.spendable) > 0n) && (
          <Actions data={account.data} wallet={wallet} repayOnly />
        )}
      <Activity items={activity.data ?? []} />
    </>
  );
}

function Card({ data }: { data: Account }) {
  const { card } = data;
  const noLimit = card.active && BigInt(card.spendable) === 0n;
  return (
    <section
      className={`relative aspect-[1.6] w-full rounded-3xl p-6 text-canvas shadow-xl ${
        card.active ? "bg-night" : "bg-ink/40"
      }`}
    >
      <p className="text-xs uppercase tracking-widest opacity-70">
        {card.active ? "Available to spend" : card.issued ? "Card frozen" : "No card yet"}
      </p>
      <p className="mt-2 text-4xl font-semibold">
        {card.spendableCtc} <span className="text-lg opacity-70">tCTC</span>
      </p>
      {card.reason && <p className="mt-3 text-sm opacity-80">{REASON[card.reason]}</p>}
      {noLimit && (
        <p className="mt-3 text-sm opacity-80">Lock collateral on Sepolia to earn a limit</p>
      )}
      <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between text-xs opacity-70">
        <div>
          <p className="font-code text-base tracking-widest">
            {card.number ?? "•••• •••• •••• ••••"}
          </p>
          <p className="mt-1 font-code">{short(data.wallet)}</p>
        </div>
        <div className="text-right">
          <p>{card.expiry ? `EXP ${card.expiry}` : ""}</p>
          <p className="mt-1">Score {data.credit?.score ?? 0}/100</p>
        </div>
      </div>
    </section>
  );
}

function CardDetails({ data }: { data: Account }) {
  const { card } = data;
  if (!card.issued) return null;
  return (
    <Row title="Account number" value={card.accountNumber ?? ""}>
      <span className="text-xs text-ink/60">
        issued {card.issuedAt ? new Date(card.issuedAt * 1000).toLocaleDateString() : ""}
      </span>
    </Row>
  );
}

function Kyc({ data, wallet }: { data: Account; wallet: string }) {
  const [busy, setBusy] = useState(false);
  const { status, verified } = data.kyc;
  const label = verified ? "Verified" : status === "none" ? "Not started" : status;

  async function begin() {
    setBusy(true);
    try {
      const { url } = await startKyc(wallet);
      window.location.href = url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Row title="Identity" value={label}>
      {!verified && (
        <button
          type="button"
          onClick={begin}
          disabled={busy}
          className="rounded-full bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-50"
        >
          {status === "none" ? "Verify" : "Continue"}
        </button>
      )}
    </Row>
  );
}

function Credit({ data }: { data: Account }) {
  const c = data.credit;
  if (!c) return null;
  return (
    <section className="grid grid-cols-2 gap-3 text-sm">
      <Stat label="Limit" value={`${c.limitCtc} tCTC`} />
      <Stat label="Outstanding" value={`${c.drawnCtc} tCTC`} />
      <Stat label="Collateral" value={`${formatEther(BigInt(c.collateral))} ETH`} />
      <Stat label="Due" value={c.dueAt ? when(c.dueAt) : "—"} />
      <Stat label="Cycles repaid" value={`${c.repayCount}/${c.cycleCount}`} />
      <Stat label="Wallet balance" value={`${data.balance.ctc} tCTC`} />
    </section>
  );
}

function parseAmount(amount: string): bigint {
  try {
    return amount ? parseEther(amount) : 0n;
  } catch {
    return 0n;
  }
}

function submitLabel(mode: "draw" | "repay", signing: boolean, confirming: boolean): string {
  if (signing) return "Sign…";
  if (confirming) return "Confirming…";
  return mode === "draw" ? "Draw" : "Repay";
}

function Actions({
  data,
  wallet,
  repayOnly = false,
}: {
  data: Account;
  wallet: string;
  repayOnly?: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"draw" | "repay">(repayOnly ? "repay" : "draw");
  const queryClient = useQueryClient();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (!receipt.isSuccess) return;
    // ScoreChanged has to reach the indexer before the API sees it; poll a
    // few times instead of trusting the first refetch.
    const timer = setInterval(
      () => void queryClient.invalidateQueries({ queryKey: ["account", wallet] }),
      5_000,
    );
    void queryClient.invalidateQueries({ queryKey: ["activity", wallet] });
    setAmount("");
    reset();
    return () => clearInterval(timer);
  }, [receipt.isSuccess, queryClient, wallet, reset]);

  const max = BigInt(mode === "draw" ? data.card.spendable : (data.credit?.drawn ?? "0"));
  const wei = parseAmount(amount);
  const valid = wei > 0n && wei <= max;
  const modes = repayOnly ? (["repay"] as const) : (["draw", "repay"] as const);

  function submit() {
    if (mode === "draw") {
      writeContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "draw",
        args: [wei],
      });
    } else {
      writeContract({
        address: CREDIT_LINE,
        abi: creditLineAbi,
        functionName: "repay",
        value: wei,
      });
    }
  }

  return (
    <section className="rounded-3xl bg-white/60 p-4">
      <div className="mb-3 flex gap-2 text-sm">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 capitalize ${mode === m ? "bg-ink text-canvas" : "bg-ink/10"}`}
          >
            {m}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAmount(formatEther(max))}
          className="ml-auto text-ink/60 underline"
        >
          Max {formatEther(max)}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-full border border-ink/20 bg-transparent px-4 py-2 font-code"
        />
        <button
          type="button"
          disabled={!valid || isPending || receipt.isLoading}
          onClick={submit}
          className="rounded-full bg-ink px-5 py-2 text-canvas disabled:opacity-40"
        >
          {submitLabel(mode, isPending, receipt.isLoading)}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-700">{error.message.split("\n")[0]}</p>}
      {hash && (
        <a
          href={explorerTx("creditcoin", hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-xs underline"
        >
          View transaction
        </a>
      )}
    </section>
  );
}

function Activity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm uppercase tracking-widest text-ink/60">Activity</h2>
      <ul className="divide-y divide-ink/10 rounded-3xl bg-white/60">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p className="capitalize">{i.kind.replace("_", " ")}</p>
              <p className="text-xs text-ink/50">{when(i.timestamp)}</p>
            </div>
            <a
              href={explorerTx(i.chain, i.txHash)}
              target="_blank"
              rel="noreferrer"
              className="font-code text-xs underline"
            >
              {i.kind === "default"
                ? formatEther(BigInt(i.writtenOff ?? "0"))
                : formatEther(BigInt(i.amount ?? "0"))}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex items-center justify-between rounded-3xl bg-white/60 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-ink/60">{title}</p>
        <p className="text-sm">{value}</p>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/60 px-4 py-3">
      <p className="text-xs uppercase tracking-widest text-ink/60">{label}</p>
      <p className="mt-1 truncate">{value}</p>
    </div>
  );
}
