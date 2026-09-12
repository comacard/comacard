import { ASC_ACTION, type AscAction } from "@comacard/attestcoin";
import { Contract, type EventLog, type JsonRpcProvider } from "ethers";
import { config } from "./config.js";
import type { Prover } from "./prover.js";

const VAULT_ABI = [
  "event CollateralLocked(address indexed account, uint256 amount, uint256 nonce)",
  "event CollateralUnlocked(address indexed account, uint256 amount, uint256 nonce)",
  "event TokenLocked(address indexed account, address indexed token, uint256 amount, uint256 nonce)",
  "event TokenUnlocked(address indexed account, address indexed token, uint256 amount, uint256 nonce)",
];

const ALREADY_PROCESSED = "Query already processed";

/**
 * The revert string or message, without ethers' transcript of the transaction
 * that produced it. That transcript carries the entire encoded proof, which is
 * kilobytes of hex per line and drowns everything else in the log.
 */
function reason(error: unknown): string {
  const e = error as { reason?: unknown; shortMessage?: unknown; message?: unknown };
  for (const field of [e.reason, e.shortMessage, e.message]) {
    if (typeof field === "string" && field) return field.split("\n")[0] as string;
  }
  return String(error);
}

interface Pending {
  action: number;
  txHash: string;
  blockNumber: number;
  account: string;
  amount: bigint;
}

/**
 * Watches the source chain for the events the credit line cares about and hands
 * each one to the prover.
 *
 * Deliberately dumb about ordering and retries: `ASCBase` rejects a query it has
 * already processed, so re-submitting an event is harmless, and that makes a
 * crash-and-restart safe without any durable queue.
 */
export class Watcher {
  private readonly vault: Contract;
  private readonly seen = new Set<string>();

  constructor(
    sourceProvider: JsonRpcProvider,
    private readonly prover: Prover,
  ) {
    this.vault = new Contract(config.sourceVault, VAULT_ABI, sourceProvider);
  }

  async collect(fromBlock: number, toBlock: number): Promise<Pending[]> {
    const [locked, unlocked, tokenLocked, tokenUnlocked] = await Promise.all([
      this.vault.queryFilter("CollateralLocked", fromBlock, toBlock),
      this.vault.queryFilter("CollateralUnlocked", fromBlock, toBlock),
      this.vault.queryFilter("TokenLocked", fromBlock, toBlock),
      this.vault.queryFilter("TokenUnlocked", fromBlock, toBlock),
    ]);

    const toPending =
      (action: number) =>
      (log: EventLog): Pending => ({
        action,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        account: log.args[0] as string,
        amount: log.args[1] as bigint,
      });

    const decoded = (logs: Awaited<ReturnType<Contract["queryFilter"]>>): EventLog[] =>
      logs.filter((log): log is EventLog => "args" in log);

    // Token events carry the token as a second indexed topic, so the amount is
    // the third argument rather than the second.
    const toTokenPending =
      (action: number) =>
      (log: EventLog): Pending => ({
        action,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        account: log.args[0] as string,
        amount: log.args[2] as bigint,
      });

    return [
      ...decoded(locked).map(toPending(ASC_ACTION.collateralLocked)),
      ...decoded(unlocked).map(toPending(ASC_ACTION.collateralUnlocked)),
      ...decoded(tokenLocked).map(toTokenPending(ASC_ACTION.tokenLocked)),
      ...decoded(tokenUnlocked).map(toTokenPending(ASC_ACTION.tokenUnlocked)),
    ].sort((a, b) => a.blockNumber - b.blockNumber);
  }

  async processOnce(fromBlock: number, toBlock: number): Promise<number> {
    const pending = await this.collect(fromBlock, toBlock);
    let proved = 0;

    for (const item of pending) {
      const key = `${item.txHash}-${item.action}`;
      if (this.seen.has(key)) continue;

      try {
        const result = await this.prover.prove(
          item.action as AscAction,
          config.sepoliaChainKey,
          item.txHash,
          item.blockNumber,
        );
        this.seen.add(key);
        proved += 1;
        console.log(
          `proved ${item.account} ${item.amount} — ${item.txHash} → ${result.creditcoinTxHash}`,
        );
      } catch (error) {
        // A failure here is usually "not attested yet" or an already-processed
        // query. Both resolve on a later pass, so the loop keeps going.
        const why = reason(error);
        if (why === ALREADY_PROCESSED) {
          // The expected outcome of a restart, not a fault: the credit was
          // already granted. Saying so in one line keeps a healthy boot
          // readable, which an 8KB ethers dump of the whole proof does not.
          this.seen.add(key);
          console.log(`already credited, skipping ${item.txHash}`);
        } else {
          console.warn(`could not prove ${item.txHash}: ${why}`);
        }
      }
    }
    return proved;
  }
}
