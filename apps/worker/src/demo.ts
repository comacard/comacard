import { ASC_ACTION } from "@comacard/attestcoin";
import { Contract, formatEther, parseEther } from "ethers";
import { config, creditcoin, sepolia, signer } from "./config.js";
import { Prover } from "./prover.js";

/**
 * Runs the whole credit cycle against the live testnets and prints what the
 * chain says at each step, so the numbers can be checked rather than taken on
 * trust.
 *
 *   bun run demo              lock, prove, draw, repay
 *   bun run demo --no-lock    skip to borrowing against collateral already posted
 *
 * The lock leg is slow and not because of anything here: Attestcoin runs 30-45
 * source blocks behind, so a fresh lock is not provable for roughly nine
 * minutes. --no-lock exists for when you have already paid that cost.
 */
const VAULT_ABI = ["function lock() external payable"];
const LINE_ABI = [
  "function draw(uint256 amount) external",
  "function repay() external payable",
  "function scoreOf(address) external view returns (uint256)",
  "function limitOf(address) external view returns (uint256)",
  "function availableOf(address) external view returns (uint256)",
  "function minCycleDuration() external view returns (uint64)",
];

const LOCK_AMOUNT = parseEther("0.001");
const DRAW_FRACTION = 60n; // percent of what is available

const ctc = (v: bigint) => `${Number(formatEther(v)).toFixed(6)} CTC`;
const step = (n: number, text: string) => console.log(`\n[${n}] ${text}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const wallet = signer();
  const me = wallet.address;
  const line = new Contract(config.creditLine, LINE_ABI, wallet);

  // getFunction keeps these typed; ethers' dynamic method proxy does not.
  const call = <T>(name: string, ...args: unknown[]) =>
    line.getFunction(name)(...args) as Promise<T>;

  const read = async () => ({
    score: await call<bigint>("scoreOf", me),
    limit: await call<bigint>("limitOf", me),
    available: await call<bigint>("availableOf", me),
  });

  console.log(`borrower   ${me}`);
  console.log(`vault      ${config.sourceVault}  (Ethereum Sepolia)`);
  console.log(`credit     ${config.creditLine}  (Creditcoin CC3)`);

  const before = await read();
  console.log(`\nstarting   score ${before.score}   limit ${ctc(before.limit)}`);

  if (!process.argv.includes("--no-lock")) {
    step(1, `locking ${formatEther(LOCK_AMOUNT)} ETH on Sepolia`);
    const vault = new Contract(config.sourceVault, VAULT_ABI, wallet.connect(sepolia()));
    const lockTx = await vault.getFunction("lock")({ value: LOCK_AMOUNT });
    const lockReceipt = await lockTx.wait();
    console.log(`    ${lockTx.hash}  block ${lockReceipt?.blockNumber}`);

    step(2, "proving it to Creditcoin — attestation runs ~9 minutes behind");
    const prover = new Prover(creditcoin(), wallet);
    const proved = await prover.prove(
      ASC_ACTION.collateralLocked,
      config.sepoliaChainKey,
      lockTx.hash,
      Number(lockReceipt?.blockNumber),
    );
    console.log(`    ${proved.creditcoinTxHash}  collateral credited`);

    const credited = await read();
    console.log(`    score ${credited.score}   limit ${ctc(credited.limit)}`);
  }

  const available = (await read()).available;
  const amount = (available * DRAW_FRACTION) / 100n;
  if (amount === 0n) throw new Error("no credit available — post collateral first");

  step(3, `drawing ${ctc(amount)} of ${ctc(available)} available`);
  const drawTx = await call<{ hash: string; wait: () => Promise<unknown> }>("draw", amount);
  await drawTx.wait();
  console.log(`    ${drawTx.hash}`);
  console.log(`    available now ${ctc((await read()).available)}`);

  const hold = Number(await call<bigint>("minCycleDuration")) + 10;
  step(4, `holding ${hold}s — a cycle closed sooner earns no record`);
  await sleep(hold * 1000);

  step(5, `repaying ${ctc(amount)} in full`);
  const repayTx = await call<{ hash: string; wait: () => Promise<unknown> }>("repay", {
    value: amount,
  });
  await repayTx.wait();
  console.log(`    ${repayTx.hash}`);

  const after = await read();
  console.log("\n────────────────────────────────────────────");
  console.log(`score   ${before.score}  →  ${after.score}`);
  console.log(`limit   ${ctc(before.limit)}  →  ${ctc(after.limit)}`);
  console.log("────────────────────────────────────────────");
  console.log("\nRepaying on time raised the limit. That is the whole product.");
}

main().catch((error) => {
  console.error(`\n${error.message ?? error}`);
  process.exit(1);
});
