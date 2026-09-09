import { ASC_ACTION, type AscAction } from "@comacard/attestcoin";
import { blockProver, chainInfo, proofProvider } from "@gluwa/usc-sdk";
import { Contract, type JsonRpcProvider, type Wallet } from "ethers";
import { config } from "./config.js";

/**
 * `ASCBase.execute` is the only entry point into an Attestcoin Smart Contract.
 * Everything before it — waiting for attestation, fetching the proof — is
 * off-chain work that has to happen in that order.
 */
const CREDIT_LINE_ABI = [
  "function execute(uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) external returns (bool)",
  "function processedQueries(bytes32) external view returns (bool)",
];

export interface ProveResult {
  txHash: string;
  creditcoinTxHash: string;
  skipped?: "already-processed";
}

export class Prover {
  private readonly chainInfoProvider: chainInfo.PrecompileChainInfoProvider;
  private readonly onchain: Contract;

  constructor(
    private readonly creditcoinProvider: JsonRpcProvider,
    wallet: Wallet,
  ) {
    this.chainInfoProvider = new chainInfo.PrecompileChainInfoProvider(creditcoinProvider);
    this.onchain = new Contract(config.creditLine, CREDIT_LINE_ABI, wallet);
  }

  /** Which source chains Creditcoin will accept proofs from right now. */
  supportedChains(): Promise<unknown> {
    return this.chainInfoProvider.getSupportedChains();
  }

  /**
   * Prove one source-chain transaction and hand it to the credit line.
   *
   * The wait matters, and it waits on the right thing. A block being attested
   * on Creditcoin is not the same as the proof builder being able to serve a
   * proof over it — the service keeps its own cache and lags behind. Waiting on
   * the builder rather than the precompile is what the SDK recommends, and its
   * timeout is 15 minutes rather than 60 seconds, which matches the real lag:
   * attestation runs roughly 30-40 Sepolia blocks behind the head.
   */
  async prove(
    action: AscAction,
    chainKey: number,
    txHash: string,
    blockHeight: number,
  ): Promise<ProveResult> {
    const builder = new proofProvider.service.ProofBuilder(chainKey, config.proofBuilderUrl);
    await builder.waitUntilHeightAttested(chainKey, blockHeight);

    const result = await builder.getProof(txHash);
    if (!result.success || !result.data) {
      throw new Error(`proof generation failed for ${txHash}: ${result.error ?? "unknown"}`);
    }

    const { headerNumber, txBytes, merkleProof, continuityProof } = result.data;

    // getFunction keeps the call typed; ethers' dynamic proxy does not.
    const execute = this.onchain.getFunction("execute");
    const tx = await execute(
      action,
      chainKey,
      headerNumber,
      txBytes,
      merkleProof.root,
      merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
      continuityProof.lowerEndpointDigest,
      continuityProof.roots,
    );
    const receipt = await tx.wait();

    return { txHash, creditcoinTxHash: receipt?.hash ?? tx.hash };
  }

  /** Sanity check before submitting: does the precompile accept this proof? */
  async verifyOnly(chainKey: number, txHash: string): Promise<boolean> {
    const builder = new proofProvider.service.ProofBuilder(chainKey, config.proofBuilderUrl);
    const result = await builder.getProof(txHash);
    if (!result.success || !result.data) return false;

    const prover = new blockProver.PrecompileBlockProver(this.creditcoinProvider);
    const d = result.data;
    return prover.verifySingle(
      d.chainKey,
      d.headerNumber,
      d.txBytes,
      d.merkleProof,
      d.continuityProof,
    );
  }
}

export { ASC_ACTION };
