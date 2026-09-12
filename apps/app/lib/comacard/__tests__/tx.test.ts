import type { Config } from "wagmi";
import { awaitSuccess } from "../tx";

/**
 * The distinction this file exists for: a receipt arriving is not the transaction having worked.
 *
 * A reverted transaction produces a receipt like any other, and four screens were awaiting one and
 * then reporting success — the cross-chain lock, the faucet, the ERC20 approval before a lock, and
 * through `receipt.isSuccess`, every draw and repayment. A green check on a reverted draw is the
 * worst of them: it tells someone money moved when it did not.
 */

const receipt = vi.fn();
vi.mock("wagmi/actions", () => ({ waitForTransactionReceipt: () => receipt() }));

const config = {} as Config;
const HASH = "0xdeadbeef" as const;

beforeEach(() => vi.clearAllMocks());

test("a reverted transaction is a failure, not a confirmation", async () => {
  receipt.mockResolvedValue({ status: "reverted" });

  await expect(awaitSuccess(config, HASH, 1)).rejects.toThrow("reverted");
});

test("a success with no read-back passes", async () => {
  receipt.mockResolvedValue({ status: "success" });

  await expect(awaitSuccess(config, HASH, 1)).resolves.toBeUndefined();
});

test("a status-1 receipt is not enough when the state did not move", async () => {
  // Measured by @FjrREPO against the Fuji and Arbitrum public RPCs: both returned a status-1
  // receipt for transactions `eth_getTransactionReceipt` afterwards reported as unknown. The only
  // honest test on those chains is reading back what the transaction was supposed to change.
  receipt.mockResolvedValue({ status: "success" });

  await expect(awaitSuccess(config, HASH, 1, async () => false)).rejects.toThrow("not on chain");
  await expect(awaitSuccess(config, HASH, 1, async () => true)).resolves.toBeUndefined();
});

test("the read-back is skipped entirely when the receipt already says reverted", async () => {
  receipt.mockResolvedValue({ status: "reverted" });
  const landed = vi.fn();

  await expect(awaitSuccess(config, HASH, 1, landed)).rejects.toThrow();
  expect(landed).not.toHaveBeenCalled();
});
