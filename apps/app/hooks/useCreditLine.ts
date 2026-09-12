"use client";
import { useCallback } from "react";
import type { Address } from "viem";
import {
  useAccount,
  useConfig,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { readContract } from "wagmi/actions";
import type { TxStatus } from "../components/ui/TransactionStatus";
import {
  CREDIT_LINE,
  CREDITCOIN_CHAIN_ID,
  creditLineAbi,
  erc20Abi,
  SEPOLIA_CHAIN_ID,
  SOURCE_VAULT,
  sourceVaultAbi,
  testTokenAbi,
} from "../lib/comacard/contracts";
import { awaitSuccess } from "../lib/comacard/tx";

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
/** A write needs a real address. Reads can quietly stay idle when one is missing; a write is
 *  something the user just asked for, so it fails out loud with the env var that is missing.
 *
 *  Module scope, not inside the hook: it closes over nothing from the component, and declaring it
 *  per render gave every effect that calls it a new identity to depend on. */
function addressOf(which: "creditLine" | "sourceVault"): `0x${string}` {
  const value = which === "creditLine" ? CREDIT_LINE : SOURCE_VAULT;
  if (!value) {
    throw new Error(
      `missing env ${which === "creditLine" ? "NEXT_PUBLIC_CREDIT_LINE" : "NEXT_PUBLIC_SOURCE_VAULT"}`,
    );
  }
  return value;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a fetch-with-cancellation effect body; the branching is the cancelled/error/empty handling the pattern requires
export function useCreditLine() {
  const { address, chainId } = useAccount();
  const config = useConfig();
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

  /**
   * The full account row, which is the only way to read what is actually outstanding.
   *
   * There is no `drawnOf` view: `CreditAccount.drawn` is internal and `accountOf` is what exposes
   * it, along with `dueAt` and the cycle counters. A screen that offers to settle a balance has to
   * know the balance exactly, because `repay()` reverts when `msg.value` exceeds the debt.
   */
  const account = useReadContract({
    address: CREDIT_LINE,
    abi: creditLineAbi,
    functionName: "accountOf",
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

  /**
   * Lock ERC20 collateral on Sepolia.
   *
   * Two transactions, not one, and the first is easy to forget: `lockToken` pulls with
   * `transferFrom`, so the vault needs an allowance before it can move anything. The approval is
   * skipped when the existing one already covers the amount, because re-approving what is already
   * approved costs gas and a second wallet prompt for nothing.
   *
   * The vault credits what actually arrived rather than what was requested, so a fee-on-transfer
   * token cannot over-credit itself. Do not assume `amount` is what gets locked.
   */
  const lockToken = useCallback(
    async (token: `0x${string}`, amount: bigint) => {
      const vault = addressOf("sourceVault");
      if (!address) throw new Error("no wallet connected");

      const allowance = await readContract(config, {
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, vault],
        chainId: SEPOLIA_CHAIN_ID,
      });

      if (allowance < amount) {
        const approval = await writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [vault, amount],
          chainId: SEPOLIA_CHAIN_ID,
        });
        // The lock reverts if it runs before the approval is mined, so this wait is load-bearing —
        // and an approval that reverted is followed by a lock that reverts, with nothing on screen
        // saying which of the two failed.
        await awaitSuccess(config, approval, SEPOLIA_CHAIN_ID, async () => {
          const granted = await readContract(config, {
            address: token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address as Address, vault],
            chainId: SEPOLIA_CHAIN_ID,
          });
          return granted >= amount;
        });
      }

      return writeContractAsync({
        address: vault,
        abi: sourceVaultAbi,
        functionName: "lockToken",
        args: [token, amount],
        chainId: SEPOLIA_CHAIN_ID,
      });
    },
    [address, config, writeContractAsync],
  );

  /**
   * Mint yourself test collateral on Sepolia.
   *
   * The argument is in WHOLE tokens, which is the one thing to get right here: `TestToken.faucet`
   * multiplies by the token's decimals itself, so passing base units asks for 10^18 tokens and
   * reverts against `FAUCET_LIMIT`. Only ever reachable for a token that answered `FAUCET_LIMIT`.
   */
  const mint = useCallback(
    (token: `0x${string}`, wholeTokens: bigint) =>
      writeContractAsync({
        address: token,
        abi: testTokenAbi,
        functionName: "faucet",
        args: [wholeTokens],
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
  /**
   * Settle the balance. Reads the debt fresh and sends exactly that, ignoring what the caller passed.
   *
   * `repay()` refuses an overpayment rather than refunding it:
   *
   * ```solidity
   * if (msg.value > outstanding) revert RepaymentExceedsDebt(msg.value, outstanding);
   * ```
   *
   * @FjrREPO lost a transaction to this sending 480 against a debt of 479.026845637583892617. The
   * figure this screen had was `accountOf`'s, cached by react-query on a poll — right almost always
   * and wrong exactly when it matters, since a stale-high copy reverts and a stale-low one pays
   * without closing the cycle, which is the only thing that scores.
   *
   * So the value is re-read here, one call before the send. Nothing but this account's own draws can
   * move it in between, and the caller cannot be holding it open.
   */
  const repay = useCallback(
    // No parameter at all, rather than one that is accepted and ignored: a signature that still took
    // an amount would invite a caller to believe theirs was used.
    async () => {
      if (!address) throw new Error("no wallet connected");
      const line = addressOf("creditLine");
      const fresh = await readContract(config, {
        address: line,
        abi: creditLineAbi,
        functionName: "accountOf",
        args: [address],
        chainId: CREDITCOIN_CHAIN_ID,
      });
      if (fresh.drawn === 0n) throw new Error("nothing is owed");
      return writeContractAsync({
        address: line,
        abi: creditLineAbi,
        functionName: "repay",
        value: fresh.drawn,
        chainId: CREDITCOIN_CHAIN_ID,
      });
    },
    [address, config, writeContractAsync],
  );

  // The four stages a person can tell apart, derived once here so no screen has to reassemble them
  // from three booleans and get the order wrong. Null means nothing is in flight.
  // `receipt.isSuccess` is wagmi reporting that the QUERY resolved, not that the transaction
  // succeeded: a revert resolves it too, with `status: "reverted"`. Reading only the flag showed a
  // green check for every reverted draw and repayment.
  const txStatus: TxStatus | null =
    error || receipt.data?.status === "reverted"
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
    /** Outstanding principal, in credit-asset wei. Zero when nothing is owed. */
    drawn: account.data?.drawn,
    /** Unix seconds the outstanding balance is due by. Zero when nothing is drawn. */
    dueAt: account.data?.dueAt,
    /** When the current cycle opened. `minCycleDuration` is measured from here. */
    drawnAt: account.data?.drawnAt,
    account: account.data,
    lockedCollateral: locked.data,
    /**
     * True while the credit line has not answered yet.
     *
     * The Creditcoin RPC takes about four seconds a call, measured, against 1.2s for the indexer and
     * 0.7s for Sepolia. For that whole window `available` is undefined, and every screen that wrote
     * `(available ?? 0n) === 0n` rendered a greyed-out Spend button — a definite "you have nothing"
     * for a figure nothing had read yet. Same rule as everywhere else today: an unresolved read is
     * not a zero.
     */
    loading: limit.isLoading || available.isLoading || account.isLoading,
    reads: { limit, available, score, locked, account },
    lock,
    lockToken,
    mint,
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
