"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { relativeTime } from "../lib/activity/map";
import type { ActivityItem } from "../lib/comacard/activity";
import {
  CREDITCOIN_CHAIN_ID,
  explorerTx,
  NATIVE_SYMBOL,
  SEPOLIA_CHAIN_ID,
  WORMHOLE_CHAIN_NAMES,
  WORMHOLE_VAULTS,
} from "../lib/comacard/contracts";
import { query, WALLET_TRANSACTIONS, type WalletTransactionsResult } from "../lib/comacard/graphql";
import { useWallet } from "./useWallet";

/**
 * The wallet's real transaction history, straight from the Envio indexer.
 *
 * Seven row types across six chains, merged into one feed: draws and repayments on Creditcoin,
 * Attestcoin locks on Sepolia with the proofs that carry them across, defaults, and the Wormhole
 * deposits and withdrawals from the other five chains. They are interleaved by block timestamp,
 * which is the only ordering that makes sense when the events come from different chains.
 *
 * The Wormhole rows were missing at first and the gap was silent: a cross-chain deposit raised the
 * limit and nothing in the list accounted for it, because `CollateralLock` only covers Sepolia.
 *
 * Rows are emitted as `ActivityItem`, the shape `ActivityList` and `ActivityRow` already render, so
 * the feed gained real data without a single icon or layout change. New `kind` values map onto
 * icons that already existed.
 *
 * Unlike the vault feed this has **no fixture fallback**. An empty list here means the chain has no
 * record of this wallet, which is a true and useful statement; inventing rows would not be.
 */

/** Base units to a short human string, against the asset's own decimals. Display only.
 *  A 6-decimal stablecoin read as 18 is off by a factor of a trillion and still looks plausible. */
function amount(wei: string, symbol: string, decimals = 18): string {
  const n = Number((BigInt(wei) * 10_000n) / 10n ** BigInt(decimals)) / 10_000;
  const digits = n > 0 && n < 1 ? 4 : 2;
  return `${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${symbol}`;
}

/** Rows carry a numeric id because `ActivityItem` does; the indexer's ids are hashes, so the sort
 *  position stands in. Nothing keys off it except React, and the list is rebuilt whole. */
type Raw = { at: number; item: Omit<ActivityItem, "id" | "when"> };

const onCreditcoin = (hash: string) => explorerTx(CREDITCOIN_CHAIN_ID, hash);
const onEthereum = (hash: string) => explorerTx(SEPOLIA_CHAIN_ID, hash);

/** Draws and repayments on Creditcoin: what the card did. */
function creditRows(data: WalletTransactionsResult, rows: Raw[]): void {
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
}

/** The Sepolia path — a lock, the proof that carries it across, and a default. */
function attestcoinRows(data: WalletTransactionsResult, rows: Raw[]): void {
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
}

/** Chain name, native symbol and explorer for a Wormhole chain id, in one read. */
function remoteChain(wormholeChainId: number): {
  sym: string;
  chain: string;
  evmChainId: number | undefined;
} {
  return {
    sym: NATIVE_SYMBOL[wormholeChainId] ?? "ETH",
    chain: WORMHOLE_CHAIN_NAMES[wormholeChainId] ?? "another chain",
    evmChainId: WORMHOLE_VAULTS[wormholeChainId]?.evmChainId,
  };
}

/**
 * Collateral that crossed by Wormhole.
 *
 * A deposit is two moments on two chains — the lock, and the credit that follows once the guardians
 * have signed — and both are worth a row: the gap between them is minutes, and during it the limit
 * has not moved yet.
 */
function remoteDepositRows(data: WalletTransactionsResult, rows: Raw[]): void {
  for (const d of data.RemoteDeposit) {
    // A mid-sync read: the deposit row landed and its asset row has not. Without decimals the
    // amount cannot be shown, and assuming 18 misprices a 6-decimal stablecoin by a trillion.
    if (d.asset === null) continue;
    const { sym, chain, evmChainId } = remoteChain(d.asset.wormholeChainId);
    const shown = amount(d.amount, sym, d.asset.decimals);
    rows.push({
      at: Number(d.lockedAt) * 1000,
      item: {
        cat: "you",
        kind: "collateral-locked",
        group: "deposit",
        href: evmChainId ? explorerTx(evmChainId, d.lockTxHash) : undefined,
        detail: `${shown} put down on ${chain}`,
      },
    });
    if (d.creditedAt !== null && d.creditTxHash !== null) {
      rows.push({
        at: Number(d.creditedAt) * 1000,
        item: {
          cat: "auto",
          kind: "proved",
          group: "deposit",
          href: onCreditcoin(d.creditTxHash),
          detail: `${shown} now backs your credit limit`,
        },
      });
    }
  }
}

/**
 * A withdrawal is three transactions and only two of them are the borrower's. The relay's approval
 * in between is the protocol working, not something they did, so it gets no row.
 */
function remoteWithdrawalRows(data: WalletTransactionsResult, rows: Raw[]): void {
  for (const w of data.RemoteWithdrawal) {
    if (w.asset === null) continue;
    const { sym, chain, evmChainId } = remoteChain(w.asset.wormholeChainId);
    const shown = amount(w.amount, sym, w.asset.decimals);
    rows.push({
      at: Number(w.requestedAt) * 1000,
      item: {
        cat: "you",
        kind: "collateral-released",
        group: "deposit",
        href: onCreditcoin(w.requestTxHash),
        detail: `${shown} released from your limit`,
      },
    });
    if (w.withdrawnAt !== null && w.withdrawTxHash !== null) {
      rows.push({
        at: Number(w.withdrawnAt) * 1000,
        item: {
          cat: "you",
          kind: "collateral-released",
          group: "deposit",
          href: evmChainId ? explorerTx(evmChainId, w.withdrawTxHash) : undefined,
          detail: `${shown} back in your wallet on ${chain}`,
        },
      });
    }
  }
}

/**
 * One feed from seven sources, interleaved by block timestamp — the only ordering that means
 * anything when the events come from six different chains.
 *
 * Split per carrier rather than written as one loop: it was a single function of complexity 35 by
 * the time the Wormhole rows went in, and the three groups have nothing to say to each other.
 */
function build(data: WalletTransactionsResult): Raw[] {
  const rows: Raw[] = [];
  creditRows(data, rows);
  attestcoinRows(data, rows);
  remoteDepositRows(data, rows);
  remoteWithdrawalRows(data, rows);
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
        at: r.at,
        ...r.item,
      }))
    : [];

  return { loading: !!address && result.isLoading, items, error: result.isError };
}
