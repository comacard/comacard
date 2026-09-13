"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { relativeTime } from "../lib/activity/map";
import type { ActivityItem } from "../lib/comacard/activity";
import { CREDITCOIN_CHAIN_ID, explorerTx, SEPOLIA_CHAIN_ID } from "../lib/comacard/contracts";
import { query, WALLET_TRANSACTIONS, type WalletTransactionsResult } from "../lib/comacard/graphql";
import { useWallet } from "./useWallet";

/**
 * The wallet's real transaction history, straight from the Envio indexer.
 *
 * Five row types across two chains, merged into one feed: draws and repayments on Creditcoin,
 * collateral locks on Sepolia, defaults, and the Attestcoin proofs that carry a lock across. They
 * are interleaved by block timestamp, which is the only ordering that makes sense when the events
 * come from different chains.
 *
 * Rows are emitted as `ActivityItem`, the shape `ActivityList` and `ActivityRow` already render, so
 * the feed gained real data without a single icon or layout change. New `kind` values map onto
 * icons that already existed.
 *
 * Unlike the vault feed this has **no fixture fallback**. An empty list here means the chain has no
 * record of this wallet, which is a true and useful statement; inventing rows would not be.
 */

/** 18-decimal base units to a short human string. Display only. */
function amount(wei: string, symbol: string): string {
  const n = Number((BigInt(wei) * 10_000n) / 10n ** 18n) / 10_000;
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol}`;
}

/** Rows carry a numeric id because `ActivityItem` does; the indexer's ids are hashes, so the sort
 *  position stands in. Nothing keys off it except React, and the list is rebuilt whole. */
type Raw = { at: number; item: Omit<ActivityItem, "id" | "when"> };

const onCreditcoin = (hash: string) => explorerTx(CREDITCOIN_CHAIN_ID, hash);
const onEthereum = (hash: string) => explorerTx(SEPOLIA_CHAIN_ID, hash);

function build(data: WalletTransactionsResult): Raw[] {
  const rows: Raw[] = [];

  for (const d of data.Draw) {
    rows.push({
      at: Number(d.timestamp) * 1000,
      item: {
        cat: "you",
        kind: "drew",
        group: "card",
        href: onCreditcoin(d.txHash),
        detail: `${amount(d.amount, "tCTC")} from your credit limit`,
      },
    });
  }
  for (const r of data.Repayment) {
    rows.push({
      at: Number(r.timestamp) * 1000,
      item: {
        cat: "you",
        kind: "repaid",
        group: "card",
        href: onCreditcoin(r.txHash),
        detail: r.settled
          ? `${amount(r.amount, "tCTC")} paid back, balance cleared`
          : `${amount(r.amount, "tCTC")} paid back`,
      },
    });
  }
  for (const l of data.CollateralLock) {
    rows.push({
      at: Number(l.timestamp) * 1000,
      item: l.released
        ? {
            cat: "you",
            kind: "collateral-released",
            group: "deposit",
            href: onEthereum(l.txHash),
            detail: `${amount(l.amount, "ETH")} returned to your wallet`,
          }
        : {
            cat: "you",
            kind: "collateral-locked",
            group: "deposit",
            href: onEthereum(l.txHash),
            // "on Ethereum", not "on Sepolia": the network name means nothing to most people, the
            // chain does. The point of the sentence is that the money never left it.
            detail: `${amount(l.amount, "ETH")} put down on Ethereum`,
          },
    });
  }
  for (const x of data.Default) {
    rows.push({
      at: Number(x.timestamp) * 1000,
      item: {
        cat: "auto",
        kind: "defaulted",
        group: "card",
        flag: true,
        href: onCreditcoin(x.txHash),
        detail: `${amount(x.writtenOff, "tCTC")} written off`,
      },
    });
  }
  for (const a of data.Attestation) {
    // A proof is not something the user did; it is the protocol catching up with something they did.
    const detail =
      a.kind === "collateral_credited"
        ? `${amount(a.amount, "ETH")} now backs your credit limit`
        : a.kind === "collateral_released"
          ? `${amount(a.amount, "ETH")} no longer backs your limit`
          : "Your wallet history was verified";
    rows.push({
      at: Number(a.timestamp) * 1000,
      item: { cat: "auto", kind: "proved", group: "deposit", href: onCreditcoin(a.txHash), detail },
    });
  }

  return rows.sort((a, b) => b.at - a.at);
}

export function useTransactions(): { loading: boolean; items: ActivityItem[]; error: boolean } {
  const { address } = useWallet();

  const result = useQuery({
    queryKey: ["comacard", "transactions", address],
    enabled: !!address,
    // The indexer lags a block or two behind the chain; a minute is far tighter than it needs.
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await query<WalletTransactionsResult>(WALLET_TRANSACTIONS, {
        // Envio lowercases account ids, and a checksummed address silently matches nothing.
        wallet: (address ?? "").toLowerCase(),
      });
      if (!res.ok) throw new Error(res.message);
      return res.value;
    },
  });

  // The clock is read after mount, never during render. A relative time computed while rendering
  // bakes the server's clock into the HTML and desyncs the first client paint, and it makes the
  // render impure besides. The interval is what keeps "3h ago" from going stale on a long session;
  // until the first tick lands `when` is empty, which `ActivityRow` already renders as no timestamp.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const frame = requestAnimationFrame(tick);
    const id = setInterval(tick, 30_000);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(id);
    };
  }, []);

  const items: ActivityItem[] = result.data
    ? build(result.data).map((r, i) => ({
        id: i,
        when: now === null ? "" : relativeTime(r.at, now),
        ...r.item,
      }))
    : [];

  return { loading: !!address && result.isLoading, items, error: result.isError };
}
