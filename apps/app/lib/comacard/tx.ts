import type { Config } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

/**
 * Waiting for a receipt is not the same as the transaction having worked, and this app had been
 * treating them as the same thing in four places.
 *
 * **A receipt is not a success.** A reverted transaction produces one, with `status: "reverted"`.
 * Awaiting `waitForTransactionReceipt` and then showing a green check reports a revert as a
 * confirmation — on the lock screen, the faucet, and, through `receipt.isSuccess` (which is wagmi's
 * "the query resolved", not "the transaction succeeded"), on every draw and repayment.
 *
 * **And a success is not always proof.** @FjrREPO hit this writing the worker's release sweep: the
 * Fuji and Arbitrum public RPCs both returned a status-1 receipt for transactions that
 * `eth_getTransactionReceipt` afterwards reported as unknown. On those chains the only honest test
 * is reading back the state the transaction was supposed to change, which is what `landed` is for.
 *
 * `tx.wait()` resolving to null without throwing is the ethers-side version of the same trap, and
 * it is why this returns nothing rather than a receipt: there is no shape of return value a caller
 * can forget to check.
 */
export async function awaitSuccess(
  config: Config,
  hash: `0x${string}`,
  chainId: number,
  /** Reads back the state the transaction was meant to change. Omit only where no such read exists. */
  landed?: () => Promise<boolean>,
): Promise<void> {
  const receipt = await waitForTransactionReceipt(config, { hash, chainId });
  if (receipt.status !== "success") throw new Error("transaction reverted");
  if (landed && !(await landed())) {
    throw new Error("transaction confirmed but the change it was sent to make is not on chain");
  }
}
