import { config, creditcoin, sepolia, signer } from "./config.js";
import { Prover } from "./prover.js";
import { Watcher } from "./watcher.js";

/**
 * The oracle query worker from the Attestcoin architecture: it watches the
 * source chain, asks the proof builder for an inclusion proof, and submits it
 * to the credit line on Creditcoin.
 */
async function main(): Promise<void> {
  const sourceProvider = sepolia();
  const prover = new Prover(creditcoin(), signer());
  const watcher = new Watcher(sourceProvider, prover);

  console.log("supported source chains:", await prover.supportedChains());

  let cursor = (await sourceProvider.getBlockNumber()) - config.lookbackBlocks;
  console.log(`watching ${config.sourceVault} from block ${cursor}`);

  for (;;) {
    const head = await sourceProvider.getBlockNumber();
    if (head > cursor) {
      const proved = await watcher.processOnce(cursor, head);
      if (proved > 0) console.log(`proved ${proved} event(s) up to block ${head}`);
      cursor = head + 1;
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
