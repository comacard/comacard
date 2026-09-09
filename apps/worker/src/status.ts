import { chainInfo } from "@gluwa/usc-sdk";
import { config, creditcoin, sepolia } from "./config.js";

/** How far behind the source chain Creditcoin's attestations currently are. */
async function main(): Promise<void> {
  const info = new chainInfo.PrecompileChainInfoProvider(creditcoin());
  console.log("supported source chains:", await info.getSupportedChains());

  const head = await sepolia().getBlockNumber();
  const attested = await info.getLatestAttestedHeightAndHash(config.sepoliaChainKey);
  const lag = head - Number(attested.height);

  console.log(`sepolia head:      ${head}`);
  console.log(`latest attested:   ${attested.height}`);
  console.log(`lag:               ${lag} blocks (~${Math.round((lag * 12) / 60)} min)`);
  console.log(`proof builder:     ${config.proofBuilderUrl}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
