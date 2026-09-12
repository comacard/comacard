import { config, creditcoin, sepolia, signer } from "./config.js";
import { Prover } from "./prover.js";
import { watch as relayWatch } from "./relay.js";
import { Watcher } from "./watcher.js";

/**
 * The oracle query worker from the Attestcoin architecture: it watches the
 * source chain, asks the proof builder for an inclusion proof, and submits it
 * to the credit line on Creditcoin.
 *
 * It runs the Wormhole relay beside it. Collateral arrives by two carriers —
 * Attestcoin from Sepolia, Wormhole from everywhere else — and a deposit that
 * needs a person to finish it is a deposit that stops overnight.
 */
async function main(): Promise<void> {
  const sourceProvider = sepolia();
  const wallet = signer();
  const prover = new Prover(creditcoin(), wallet);
  const watcher = new Watcher(sourceProvider, prover);

  // Separate loop, deliberately not awaited: the two carriers have completely
  // different latencies, and neither should be able to stall the other. A crash
  // in here must not take the Attestcoin path down with it.
  relayWatch(wallet).catch((error) => {
    console.error("wormhole relay stopped:", error);
  });

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
