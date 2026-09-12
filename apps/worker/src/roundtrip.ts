import { Contract, formatEther, formatUnits, JsonRpcProvider, parseEther } from "ethers";

import { config, creditcoin, signer, vaults, type WormholeChainId } from "./config.js";
import { deliver, fetchVaa } from "./relay.js";

/**
 * The cross-chain story end to end, against the live testnets.
 *
 *   bun run roundtrip           Avalanche Fuji, the fastest chain
 *   bun run roundtrip 4         BSC Testnet
 *   bun run roundtrip 10004     Base Sepolia, ~20 minutes
 *
 * Deposit on another chain, watch it become credit on Creditcoin, ask for it
 * back, watch it come home. Every figure is read off a contract rather than
 * computed here, so the numbers can be checked instead of believed.
 *
 * It exists because the alternative is a dozen hand-typed `cast` commands, and
 * writing those out by hand for the runbook I got two of them wrong — a release
 * too small to strand a debt, and a repayment larger than the debt, which the
 * contract refuses rather than refunding. Neither failed loudly.
 *
 * Pick an L1 if it has to land on camera. Guardians sign in well under a minute
 * for BSC and Fuji; an L2 finalizes against Ethereum and takes fifteen to
 * twenty.
 */

const HUB_ABI = [
  "function requestRelease(uint16 chainId, bytes32 token, uint256 amount) payable returns (uint64)",
  "function valueOf(address account) view returns (uint256)",
  "function collateralOf(address account, bytes32 assetId) view returns (uint256)",
];
const LINE_ABI = [
  "function limitOf(address) view returns (uint256)",
  "function availableOf(address) view returns (uint256)",
  "function scoreOf(address) view returns (uint256)",
];
const VAULT_ABI = [
  "function lockNative() payable returns (uint64)",
  "function nativeBalanceOf(address) view returns (uint256)",
  "function nativeReleasable(address) view returns (uint256)",
  "function unlockNative(uint256 amount)",
  "event Locked(address indexed account, address indexed token, uint256 amount, uint64 sequence)",
];
const RELAY_ABI = ["function executeRelease(bytes vaa)"];

const NATIVE = `0x${"0".repeat(64)}`;
const DEPOSIT = parseEther("0.02");
const RELEASE = parseEther("0.01");

const ctc = (v: bigint) => `${Number(formatEther(v)).toFixed(4)} CTC`;
const step = (n: string, text: string) => console.log(`\n[${n}] ${text}`);

async function main(): Promise<void> {
  const chainId = Number(process.argv[2] ?? 6) as WormholeChainId;
  const chain = vaults[chainId];
  if (!chain) {
    console.error(`unknown chain ${chainId}. known: ${Object.keys(vaults).join(", ")}`);
    process.exit(1);
  }

  const wallet = signer();
  const me = wallet.address;
  const far = wallet.connect(new JsonRpcProvider(chain.rpc));

  const hub = new Contract(config.collateralHub, HUB_ABI, wallet);
  const line = new Contract(config.creditLine, LINE_ABI, creditcoin());
  const vault = new Contract(chain.vault, VAULT_ABI, far);
  const relay = new Contract(chain.relay, RELAY_ABI, far);

  const hubCall = <T>(n: string, ...a: unknown[]) => hub.getFunction(n)(...a) as Promise<T>;
  const lineCall = <T>(n: string, ...a: unknown[]) => line.getFunction(n)(...a) as Promise<T>;
  const vaultCall = <T>(n: string, ...a: unknown[]) => vault.getFunction(n)(...a) as Promise<T>;

  const snapshot = async () => ({
    held: await vaultCall<bigint>("nativeBalanceOf", me),
    credited: await hubCall<bigint>("valueOf", me),
    limit: await lineCall<bigint>("limitOf", me),
  });

  console.log(`borrower   ${me}`);
  console.log(`chain      ${chain.name}  (wormhole ${chainId})`);
  console.log(`vault      ${chain.vault}`);
  console.log(`relay      ${chain.relay}`);
  console.log(`hub        ${config.collateralHub}  (Creditcoin CC3)`);

  const start = await snapshot();
  console.log(
    `\nstarting   ${formatEther(start.held)} held on ${chain.name}` +
      `   ${ctc(start.credited)} credited   limit ${ctc(start.limit)}`,
  );

  // ---- out ----
  step("1", `locking ${formatEther(DEPOSIT)} on ${chain.name}`);
  const lockTx = await vaultCall<{ wait: () => Promise<{ logs: unknown[]; hash: string }> }>(
    "lockNative",
    { value: DEPOSIT },
  );
  const lockReceipt = await lockTx.wait();
  console.log(`    ${lockReceipt.hash}`);

  const locked = vault.interface.parseLog(
    lockReceipt.logs.find(
      (l) =>
        (l as { topics: string[] }).topics[0] === vault.interface.getEvent("Locked")?.topicHash,
    ) as never,
  );
  const sequence = BigInt(locked?.args[3] ?? 0n);
  console.log(`    wormhole sequence ${sequence} — the asset stays here, only the message crosses`);

  step("2", "waiting for the guardians");
  const depositVaa = await fetchVaa(chainId, sequence);
  console.log(`    signed, ${(depositVaa.length - 2) / 2} bytes`);

  step("3", "delivering it to Creditcoin");
  console.log(`    ${await deliver(depositVaa, wallet)}`);

  const funded = await snapshot();
  console.log(
    `    credited ${ctc(funded.credited)} (+${ctc(funded.credited - start.credited)})` +
      `   limit ${ctc(funded.limit)} (+${ctc(funded.limit - start.limit)})`,
  );

  // ---- and back ----
  step("4", `asking for ${formatEther(RELEASE)} back — nobody approves this`);
  const releaseTx = await hubCall<{ wait: () => Promise<{ hash: string }> }>(
    "requestRelease",
    chainId,
    NATIVE,
    RELEASE,
  );
  const releaseReceipt = await releaseTx.wait();
  console.log(`    ${releaseReceipt.hash}`);

  const debited = await snapshot();
  console.log(
    `    credit gone first: ${ctc(funded.credited)} → ${ctc(debited.credited)}` +
      `   limit ${ctc(debited.limit)}`,
  );

  step("5", "waiting for the guardians again, this time outbound");
  const hubSeq = await nextHubSequence(releaseReceipt.hash);
  const releaseVaa = await fetchVaa(
    config.creditcoinWormholeChainId,
    hubSeq,
    30 * 60_000,
    config.collateralHub,
  );
  console.log(`    signed, ${(releaseVaa.length - 2) / 2} bytes`);

  step("6", `letting ${chain.name} release it`);
  const exec = await relay.getFunction("executeRelease")(releaseVaa);
  await exec.wait();
  console.log(`    releasable ${formatUnits(await vaultCall<bigint>("nativeReleasable", me), 18)}`);

  step("7", "the borrower takes it — the relay approves, it never pushes");
  const unlock = await vaultCall<{ wait: () => Promise<{ hash: string }> }>(
    "unlockNative",
    RELEASE,
  );
  console.log(`    ${(await unlock.wait()).hash}`);

  const end = await snapshot();
  console.log("\n────────────────────────────────────────────");
  console.log(`held on ${chain.name}   ${formatEther(start.held)} → ${formatEther(end.held)}`);
  console.log(`credited              ${ctc(start.credited)} → ${ctc(end.credited)}`);
  console.log(`limit                 ${ctc(start.limit)} → ${ctc(end.limit)}`);
  console.log("────────────────────────────────────────────");
  console.log("\nThe coin never left its chain, and no operator touched either leg.");
}

/** The hub's message sequence, read from the receipt rather than guessed. */
async function nextHubSequence(txHash: string): Promise<bigint> {
  const receipt = await creditcoin().getTransactionReceipt(txHash);
  const iface = new Contract(config.collateralHub, [
    "event ReleaseRequested(address indexed account, bytes32 indexed assetId, uint256 amount, uint64 sequence)",
  ]).interface;

  for (const log of receipt?.logs ?? []) {
    if (log.address.toLowerCase() !== config.collateralHub.toLowerCase()) continue;
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed?.name === "ReleaseRequested") return BigInt(parsed.args[3]);
  }
  throw new Error("no ReleaseRequested in the receipt — did requestRelease revert?");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
