import { AbiCoder, Contract, JsonRpcProvider, Wallet } from "ethers";

import { config, creditcoin, vaults, type WormholeChainId } from "./config";

/**
 * Carries messages both ways: a locked deposit from whichever chain it sits on
 * to Creditcoin, and a release back out to the chain holding the collateral.
 *
 * Creditcoin has the Wormhole Core Contract and nothing else — no token bridge,
 * no automatic relayer — so the guardians sign the message and then somebody has
 * to hand it over. That somebody is this. It is deliberately not privileged:
 * neither `receiveFromWormhole` nor `executeRelease` trusts the sender, only the
 * signatures, so a borrower who would rather not wait for us can submit the same
 * bytes themselves.
 */

const HUB_ABI = [
  "function receiveFromWormhole(bytes vaa) returns (address account, bytes32 assetId, uint256 amount)",
  "function consumedVaa(bytes32) view returns (bool)",
];

const VAULT_ABI = [
  "event Locked(address indexed account, address indexed token, uint256 amount, uint64 sequence)",
];

const RELAY_ABI = [
  "function executeRelease(bytes vaa)",
  "function consumedVaa(bytes32) view returns (bool)",
  "function armed() view returns (bool)",
];

/** Creditcoin publishes one of these when a borrower asks for collateral back. */
const HUB_RELEASE_ABI = [
  "event ReleaseRequested(address indexed account, bytes32 indexed assetId, uint256 amount, uint64 sequence)",
];

/**
 * Waits for a transaction and insists it actually succeeded.
 *
 * `wait()` resolves to null when no receipt is available yet and does not throw,
 * so `await tx.wait()` on its own reports a delivery that never happened. That
 * is worse than a failure: the sweep marks the message delivered, never retries
 * it, and a borrower's withdrawal sits unexecuted with nothing in the log but a
 * success line.
 */
async function confirmed(tx: {
  wait: () => Promise<{ status?: number | null; hash: string } | null>;
}) {
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt: the transaction was not mined");
  if (receipt.status !== 1) throw new Error(`reverted on chain (${receipt.hash})`);
  return receipt;
}

/** Wormholescan wants the emitter as a 32-byte hex string with no 0x. */
function emitter(address: string): string {
  return address.toLowerCase().replace("0x", "").padStart(64, "0");
}

/**
 * Fetches a signed VAA, waiting for the guardians if it is not signed yet.
 *
 * The vaults publish at consistency level "finalized", so on an L2 this is not
 * fast: Base Sepolia finalizes against Ethereum, which takes on the order of
 * fifteen minutes. That is the honest price of not crediting collateral that a
 * reorg could take back.
 */
export async function fetchVaa(
  chainId: number,
  sequence: bigint,
  timeoutMs = 30 * 60_000,
  /** Defaults to that chain's vault. Releases are emitted by the hub instead. */
  emitterAddress?: string,
): Promise<string> {
  const from = emitterAddress ?? vaults[chainId as WormholeChainId]?.vault;
  if (!from) throw new Error(`no emitter for chain ${chainId}`);
  const url = `${config.wormholescan}/v1/signed_vaa/${chainId}/${emitter(from)}/${sequence}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetch(url);
    if (response.ok) {
      const body = (await response.json()) as { vaaBytes?: string };
      if (body.vaaBytes) return `0x${Buffer.from(body.vaaBytes, "base64").toString("hex")}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
  throw new Error(`no VAA for chain ${chainId} sequence ${sequence} after ${timeoutMs}ms`);
}

/** Submits a signed VAA to the hub on Creditcoin. */
export async function deliver(vaa: string, wallet: Wallet): Promise<string> {
  const hub = new Contract(config.collateralHub, HUB_ABI, wallet);
  // getFunction keeps the call typed; ethers' dynamic method proxy does not.
  const tx = await hub.getFunction("receiveFromWormhole")(vaa);
  return (await confirmed(tx)).hash;
}

/**
 * Every deposit a chain's vault has published, oldest first.
 *
 * Scanned in chunks because public RPCs cap the range: Base Sepolia answers
 * `eth_getLogs is limited to a 10,000 range` with a 413 and nothing else, and
 * Creditcoin simply times out. One window, one request, every time.
 */
export async function pendingDeposits(
  chainId: WormholeChainId,
  fromBlock: number,
  toBlock?: number,
) {
  const { JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(vaults[chainId].rpc);
  const vault = new Contract(vaults[chainId].vault, VAULT_ABI, provider);
  const filter = vault.filters.Locked;
  if (!filter) throw new Error("Locked event missing from the vault ABI");

  const head = toBlock ?? (await provider.getBlockNumber());
  const logs = [];
  for (let start = fromBlock; start <= head; start += config.logWindowBlocks) {
    const end = Math.min(start + config.logWindowBlocks - 1, head);
    logs.push(...(await vault.queryFilter(filter(), start, end)));
  }

  return logs.map((log) => {
    const args = (log as unknown as { args: [string, string, bigint, bigint] }).args;
    return {
      account: args[0],
      token: args[1],
      amount: args[2],
      sequence: args[3],
      block: log.blockNumber,
    };
  });
}

/**
 * Delivers every deposit that is ready, on every chain, forever.
 *
 * Deliberately dumb about ordering and retries, the same way the Attestcoin
 * watcher is: the hub rejects a VAA it has already consumed, so re-submitting
 * is harmless and a crash-and-restart needs no durable queue. A deposit whose
 * guardians have not signed yet simply is not fetched this round and is picked
 * up on a later one.
 */
export async function watch(wallet: Wallet): Promise<never> {
  const hub = new Contract(config.collateralHub, HUB_ABI, wallet);
  const delivered = new Set<string>();
  const attempts = new Map<string, number>();
  // `getLogs` from block zero times out or 413s on these RPCs, so every scan is
  // a window rather than the whole chain.
  const windows = new Map<WormholeChainId, number>();
  const chains = Object.keys(vaults).map(Number) as WormholeChainId[];
  const hubLog = new Contract(config.collateralHub, HUB_RELEASE_ABI, creditcoin());
  let releaseCursor: number | undefined;

  for (;;) {
    for (const chainId of chains) {
      try {
        windows.set(chainId, await sweep(chainId, hub, delivered, windows.get(chainId)));
      } catch (error) {
        // One chain's RPC being unhappy must not stop the others.
        console.error(`${vaults[chainId].name}:`, (error as Error).message);
      }
    }

    // The way back. Same isolation: a failure here must not stop deposits.
    try {
      releaseCursor = await sweepReleases(hubLog, wallet, delivered, attempts, releaseCursor);
    } catch (error) {
      console.error("releases:", (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

/** Delivers whatever is ready on one chain. Returns where to resume. */
async function sweep(
  chainId: WormholeChainId,
  hub: Contract,
  delivered: Set<string>,
  cursor: number | undefined,
): Promise<number> {
  const { JsonRpcProvider } = await import("ethers");
  const head = await new JsonRpcProvider(vaults[chainId].rpc).getBlockNumber();
  const from = Math.max(0, cursor ?? head - config.relayLookbackBlocks);

  for (const deposit of await pendingDeposits(chainId, from, head)) {
    const key = `${chainId}-${deposit.sequence}`;
    if (delivered.has(key)) continue;

    const vaa = await fetchVaaIfSigned(chainId, vaults[chainId].vault, deposit.sequence);
    if (!vaa) continue; // guardians still working; try again next round

    await submit(chainId, deposit.sequence, vaa, hub);
    delivered.add(key);
  }
  return head + 1;
}

async function submit(
  chainId: WormholeChainId,
  sequence: bigint,
  vaa: string,
  hub: Contract,
): Promise<void> {
  try {
    const tx = await hub.getFunction("receiveFromWormhole")(vaa);
    const receipt = await confirmed(tx);
    console.log(`${vaults[chainId].name} #${sequence} → ${receipt.hash}`);
  } catch (error) {
    // Already consumed means somebody else delivered it, which is a success for
    // the borrower and nothing to retry.
    if (!isAlreadyConsumed(error)) throw error;
    console.log(`${vaults[chainId].name} #${sequence} already delivered`);
  }
}

/**
 * Hands a release to whichever relay it belongs to.
 *
 * Only `AlreadyConsumed` from the relay counts as delivered, never a receipt
 * from the transaction that sent it. A receipt is not proof: BSC testnet's
 * public RPC is load-balanced, and a send there returned a status-1 receipt for
 * a transaction that no node has. Trusting it marked a withdrawal delivered and
 * stopped retrying, which is the one outcome worse than a visible failure. The
 * chain's own record settles it on the next sweep, and until it does the message
 * is offered again.
 *
 * Which chain that is is not in the event — the asset id is a hash. The signed
 * payload names it, and a relay refuses one addressed elsewhere with WrongChain,
 * so offering it to each in turn costs a revert and settles it. That refusal is
 * new: the first relays accepted any release from the hub, and this loop is what
 * surfaced it.
 */
/**
 * Reads the destination chain out of a signed release.
 *
 * A VAA is a header then a body: version(1) guardianSetIndex(4) sigCount(1),
 * then sigCount signatures of 66 bytes, then timestamp(4) nonce(4)
 * emitterChain(2) emitterAddress(32) sequence(8) consistency(1), then payload.
 * The payload is the abi-encoded release, whose second word is the chain.
 *
 * Returns null when it cannot be read as a release at all — a message published
 * before the payload carried its destination decodes as nothing, and there is no
 * relay anywhere that will take it.
 */
function destinationOf(vaa: string): number | null {
  try {
    const bytes = Buffer.from(vaa.replace("0x", ""), "hex");
    const signatures = bytes[5] ?? 0;
    const body = 6 + signatures * 66;
    const payload = bytes.subarray(body + 51); // 4+4+2+32+8+1
    if (payload.length !== 192) return null; // six words, or not a release

    const [version, chainId] = AbiCoder.defaultAbiCoder().decode(
      ["uint8", "uint16", "bytes32", "bytes32", "uint256", "uint8"],
      payload,
    );
    return Number(version) === RELEASE_VERSION ? Number(chainId) : null;
  } catch {
    return null;
  }
}

/** CollateralMessage.VERSION_RELEASE. */
const RELEASE_VERSION = 2;

/**
 * Delivers a release to the one relay it is addressed to.
 *
 * Addressed, not guessed. An earlier version offered every relay in turn and
 * took whichever accepted — which was how the missing destination check in
 * ReleaseRelay surfaced, and also five reverted transactions per message once it
 * was fixed. The payload names its chain; there is no reason to ask the others.
 */
async function deliverRelease(
  vaa: string,
  sequence: bigint,
  wallet: Wallet,
): Promise<"delivered" | "sent" | "undeliverable"> {
  const destination = destinationOf(vaa);
  if (destination === null || !(destination in vaults)) return "undeliverable";

  const chainId = destination as WormholeChainId;
  // On the destination chain, not on Creditcoin. `wallet` arrives bound to
  // Creditcoin because that is where the hub and every deposit lands, and a
  // release is the one message that travels the other way. Left as it was,
  // `executeRelease` was sent to Creditcoin addressed to a contract that only
  // exists on the far chain: no code there, so it cost gas, returned status 1,
  // and did nothing — which is also why receipts for these could never be
  // found on the chain they were supposedly sent to.
  const signer = wallet.connect(new JsonRpcProvider(vaults[chainId].rpc));
  const relay = new Contract(vaults[chainId].relay, RELAY_ABI, signer);
  try {
    const tx = await relay.getFunction("executeRelease")(vaa);
    const receipt = await confirmed(tx);
    // "submitted", not "delivered", and the wording is not pedantry. Both the
    // Fuji and Arbitrum public RPCs have returned a status-1 receipt for a
    // transaction that `eth_getTransactionReceipt` then reports as unknown, so a
    // receipt from the node that accepted it is not proof of anything. The relay
    // answering AlreadyConsumed on the next sweep is, and until it does this
    // message is offered again.
    console.log(`release #${sequence} submitted to ${vaults[chainId].name} ${receipt.hash}`);
    return "sent";
  } catch (error) {
    if (isAlreadyConsumed(error)) return "delivered";
    console.error(`release #${sequence} to ${vaults[chainId].name}:`, (error as Error).message);
    return "sent";
  }
}

/** The VAA if the guardians have signed it, null if they have not yet. */
async function fetchVaaIfSigned(
  chainId: number,
  emitterAddress: string,
  sequence: bigint,
): Promise<string | null> {
  const url = `${config.wormholescan}/v1/signed_vaa/${chainId}/${emitter(emitterAddress)}/${sequence}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const body = (await response.json()) as { vaaBytes?: string };
  return body.vaaBytes ? `0x${Buffer.from(body.vaaBytes, "base64").toString("hex")}` : null;
}

/**
 * Delivers releases: Creditcoin → the chain holding the collateral.
 *
 * The mirror of the deposit sweep and the same discipline. One scan of the hub's
 * ReleaseRequested events, and each one goes to the relay on the chain its asset
 * lives on. A release the relay has already consumed is a success for the
 * borrower, not something to retry.
 */
async function sweepReleases(
  hubLog: Contract,
  wallet: Wallet,
  delivered: Set<string>,
  attempts: Map<string, number>,
  cursor: number | undefined,
): Promise<number> {
  const head = await creditcoin().getBlockNumber();
  const from = Math.max(0, cursor ?? head - config.relayLookbackBlocks);

  const filter = hubLog.filters.ReleaseRequested;
  if (!filter) throw new Error("ReleaseRequested missing from the hub ABI");

  const logs = [];
  for (let start = from; start <= head; start += config.logWindowBlocks) {
    const end = Math.min(start + config.logWindowBlocks - 1, head);
    logs.push(...(await hubLog.queryFilter(filter(), start, end)));
  }

  for (const log of logs) {
    const sequence = (log as unknown as { args: [string, string, bigint, bigint] }).args[3];
    const key = `release-${sequence}`;
    if (delivered.has(key)) continue;

    const vaa = await fetchVaaIfSigned(
      config.creditcoinWormholeChainId,
      config.collateralHub,
      sequence,
    );
    if (!vaa) continue;

    const outcome = await deliverRelease(vaa, sequence, wallet);
    if (outcome === "delivered") {
      delivered.add(key);
      continue;
    }
    if (outcome === "undeliverable") {
      // Not a release any relay can read — published before the payload carried
      // its destination. Said once, not retried, because no number of attempts
      // will change it.
      console.error(`release #${sequence} names no chain we serve — skipping`);
      delivered.add(key);
      continue;
    }
    // "sent": a transaction went out and the relay will confirm it next sweep,
    // or it will be offered again. The budget guards against that never ending.
    const tried = (attempts.get(key) ?? 0) + 1;
    attempts.set(key, tried);
    if (tried >= config.relayMaxAttempts) {
      console.error(
        `release #${sequence} still unconfirmed after ${tried} rounds — needs a person`,
      );
      delivered.add(key);
    }
  }
  return head + 1;
}

/** `VaaAlreadyConsumed(bytes32)` on the hub, `AlreadyConsumed(bytes32)` on a relay. */
const ALREADY_CONSUMED = ["0x8665b3f2", "0x0f50872f"];

function isAlreadyConsumed(error: unknown): boolean {
  const text = JSON.stringify(error ?? "");
  return ALREADY_CONSUMED.some((selector) => text.includes(selector));
}

if (import.meta.main) {
  const wallet0 = new Wallet(process.env.WALLET_PK ?? "", creditcoin());

  if (process.argv[2] === "watch") {
    console.log(
      `relaying for ${Object.values(vaults)
        .map((v) => v.name)
        .join(", ")}`,
    );
    await watch(wallet0);
  }

  const chainId = Number(process.argv[2] ?? 10004) as WormholeChainId;
  const sequence = BigInt(process.argv[3] ?? 0);

  if (!vaults[chainId]) {
    console.error(`unknown chain ${chainId}. known: ${Object.keys(vaults).join(", ")}`);
    process.exit(1);
  }

  console.log(`waiting for ${vaults[chainId].name} sequence ${sequence} to be signed…`);

  const vaa = await fetchVaa(chainId, sequence);
  console.log(`signed, ${(vaa.length - 2) / 2} bytes`);

  const hash = await deliver(vaa, wallet0);
  console.log(`credited on Creditcoin → ${hash}`);
}
