"use client";
import { useCallback } from "react";
import type { TxStatus } from "../components/ui/TransactionStatus";
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import {
  CREDIT_LINE,
  CREDITCOIN_CHAIN_ID,
  creditLineAbi,
  SEPOLIA_CHAIN_ID,
  SOURCE_VAULT,
  sourceVaultAbi,
} from "../lib/comacard/contracts";

/**
 * The three transactions a cardholder signs, and the reads that bound them.
 *
 * Every hook pins an explicit `chainId`, which is what lets a screen read Creditcoin's limit while
 * the wallet still sits on Sepolia: wagmi routes the read through that chain's transport instead of
 * whatever the wallet happens to be on. Writes still need the wallet on the right chain, so each
 * one reports `needsChain` rather than failing at signing time.
 *
 * Reads come off the contract, not the indexer. The indexer's copy is as of the account's last
 * transaction, and repricing collateral moves every limit at once without an event per account.
 */
export function useCreditLine() {
  const { address, chainId } = useAccount();
  // Without a deployed address there is nothing to read; the query stays idle rather than
  // firing at `undefined` and surfacing a confusing RPC error.
  const enabled = Boolean(address && CREDIT_LINE && SOURCE_VAULT);

  const limit = useReadContract({
    address: CREDIT_LINE,
    abi: creditLineAbi,
    functionName: "limitOf",
    args: address ? [address] : undefined,
    chainId: CREDITCOIN_CHAIN_ID,
    query: { enabled },
  });

  const available = useReadContract({
    address: CREDIT_LINE,
    abi: creditLineAbi,
    functionName: "availableOf",
    args: address ? [address] : undefined,
    chainId: CREDITCOIN_CHAIN_ID,
    query: { enabled },
  });

  const score = useReadContract({
    address: CREDIT_LINE,
    abi: creditLineAbi,
    functionName: "scoreOf",
    args: address ? [address] : undefined,
    chainId: CREDITCOIN_CHAIN_ID,
    query: { enabled },
  });

  const locked = useReadContract({
    address: SOURCE_VAULT,
    abi: sourceVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: SEPOLIA_CHAIN_ID,
    query: { enabled },
  });

  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract();

  /** A write needs a real address. Reads can quietly stay idle when one is missing; a write is
   *  something the user just asked for, so it fails out loud with the env var that is missing. */
  function addressOf(which: "creditLine" | "sourceVault"): `0x${string}` {
    const value = which === "creditLine" ? CREDIT_LINE : SOURCE_VAULT;
    if (!value) {
      throw new Error(
        `missing env ${which === "creditLine" ? "NEXT_PUBLIC_CREDIT_LINE" : "NEXT_PUBLIC_SOURCE_VAULT"}`,
      );
    }
    return value;
  }
  const receipt = useWaitForTransactionReceipt({ hash });

  /** Lock ETH as collateral on Sepolia. Confirms in seconds and counts for nothing until Attestcoin
   *  has carried it across, which takes another seven to nine minutes. */
  const lock = useCallback(
    (value: bigint) =>
      writeContractAsync({
        address: addressOf("sourceVault"),
        abi: sourceVaultAbi,
        functionName: "lock",
        value,
        chainId: SEPOLIA_CHAIN_ID,
      }),
    [writeContractAsync],
  );

  /** Borrow CTC against the line. Starts a 30-day term on the first draw of a cycle. */
  const draw = useCallback(
    (amount: bigint) =>
      writeContractAsync({
        address: addressOf("creditLine"),
        abi: creditLineAbi,
        functionName: "draw",
        args: [amount],
        chainId: CREDITCOIN_CHAIN_ID,
      }),
    [writeContractAsync],
  );

  /** Repay principal. Only a repayment that clears the balance to zero closes a cycle and scores,
   *  so a screen should push "repay everything" rather than a slider. */
  const repay = useCallback(
    (value: bigint) =>
      writeContractAsync({
        address: addressOf("creditLine"),
        abi: creditLineAbi,
        functionName: "repay",
        value,
        chainId: CREDITCOIN_CHAIN_ID,
      }),
    [writeContractAsync],
  );

  // The four stages a person can tell apart, derived once here so no screen has to reassemble them
  // from three booleans and get the order wrong. Null means nothing is in flight.
  const txStatus: TxStatus | null = error
    ? "failed"
    : receipt.isSuccess
      ? "confirmed"
      : receipt.isLoading
        ? "confirming"
        : isPending
          ? "signing"
          : null;

  return {
    address,
    chainId,
    txStatus,
    /** False when NEXT_PUBLIC_CREDIT_LINE / NEXT_PUBLIC_SOURCE_VAULT are unset. */
    configured: Boolean(CREDIT_LINE && SOURCE_VAULT),
    onCreditcoin: chainId === CREDITCOIN_CHAIN_ID,
    onSepolia: chainId === SEPOLIA_CHAIN_ID,
    limit: limit.data,
    available: available.data,
    score: score.data,
    lockedCollateral: locked.data,
    reads: { limit, available, score, locked },
    lock,
    draw,
    repay,
    hash,
    signing: isPending,
    confirming: receipt.isLoading,
    confirmed: receipt.isSuccess,
    error,
    reset,
  };
}
