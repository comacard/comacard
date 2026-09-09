import { ASC_ACTION } from "@comacard/attestcoin";
import { creditcoin, sepolia, signer } from "./config.js";
import { Prover } from "./prover.js";

/**
 * Prove one transaction by hand.
 *
 *   bun run prove <txHash> [collateral_locked|collateral_unlocked|history]
 *
 * Useful for the demo, and for checking a single proof without leaving the
 * watcher running.
 */
const ACTIONS = {
  collateral_locked: ASC_ACTION.collateralLocked,
  collateral_unlocked: ASC_ACTION.collateralUnlocked,
  history: ASC_ACTION.historyImported,
} as const;

async function main(): Promise<void> {
  const [txHash, actionName = "collateral_locked"] = process.argv.slice(2);
  if (!txHash) throw new Error("usage: bun run prove <txHash> [action]");

  const action = ACTIONS[actionName as keyof typeof ACTIONS];
  if (action === undefined) {
    throw new Error(`unknown action ${actionName}; expected one of ${Object.keys(ACTIONS)}`);
  }

  // History comes from Ethereum mainnet; collateral from Sepolia.
  const chainKey = action === ASC_ACTION.historyImported ? 3 : 1;
  const source = sepolia();
  const receipt = await source.getTransactionReceipt(txHash);
  if (!receipt) throw new Error(`transaction ${txHash} not found on the source chain`);

  const prover = new Prover(creditcoin(), signer());
  console.log(`waiting for block ${receipt.blockNumber} to be attested…`);

  const result = await prover.prove(action, chainKey, txHash, receipt.blockNumber);
  console.log(`proved → creditcoin tx ${result.creditcoinTxHash}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
