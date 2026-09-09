import { CC3_TESTNET, CHAIN_KEY } from "@comacard/attestcoin";

/**
 * The oracle query worker described in the Attestcoin docs: watch the source
 * chain for events we care about, ask the proof builder for an inclusion proof,
 * then hand it to `ASCCreditLine.execute` on Creditcoin.
 *
 * Attestation is not instant — a block must be attested before it can be
 * proved — so this runs as a loop rather than inline with the user's action.
 */
async function main(): Promise<void> {
  console.log("indexer watching", {
    sepolia: CHAIN_KEY.sepolia,
    mainnet: CHAIN_KEY.mainnet,
    creditcoin: CC3_TESTNET.rpcUrl,
  });
  // TODO(#): subscribe to SourceVault events, prove, submit. See issue tracker.
}

await main();
