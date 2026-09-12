import { Contract, Wallet } from "ethers";

import { config, creditcoin, vaults, type WormholeChainId } from "./config";

/**
 * Carries a locked deposit from whichever chain it sits on to Creditcoin.
 *
 * Creditcoin has the Wormhole Core Contract and nothing else — no token bridge,
 * no automatic relayer — so the guardians sign the message and then somebody has
 * to hand it over. That somebody is this. It is deliberately not privileged:
 * `receiveFromWormhole` trusts the signatures, not the sender, so a borrower who
 * would rather not wait for us can submit the same bytes themselves.
 */

const HUB_ABI = [
  "function receiveFromWormhole(bytes vaa) returns (address account, bytes32 assetId, uint256 amount)",
  "function consumedVaa(bytes32) view returns (bool)",
];

const VAULT_ABI = [
  "event Locked(address indexed account, address indexed token, uint256 amount, uint64 sequence)",
];

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
  chainId: WormholeChainId,
  sequence: bigint,
  timeoutMs = 30 * 60_000,
): Promise<string> {
  const url = `${config.wormholescan}/v1/signed_vaa/${chainId}/${emitter(vaults[chainId].vault)}/${sequence}`;
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
  const receipt = await tx.wait();
  return receipt.hash;
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
  // `getLogs` from block zero times out or 413s on these RPCs, so every scan is
  // a window rather than the whole chain.
  const windows = new Map<WormholeChainId, number>();
  const chains = Object.keys(vaults).map(Number) as WormholeChainId[];

  for (;;) {
    for (const chainId of chains) {
      try {
        windows.set(chainId, await sweep(chainId, hub, delivered, windows.get(chainId)));
      } catch (error) {
        // One chain's RPC being unhappy must not stop the others.
        console.error(`${vaults[chainId].name}:`, (error as Error).message);
      }
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

    const vaa = await fetchVaaIfSigned(chainId, deposit.sequence);
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
    const receipt = await tx.wait();
    console.log(`${vaults[chainId].name} #${sequence} → ${receipt.hash}`);
  } catch (error) {
    // Already consumed means somebody else delivered it, which is a success for
    // the borrower and nothing to retry.
    if (!isAlreadyConsumed(error)) throw error;
    console.log(`${vaults[chainId].name} #${sequence} already delivered`);
  }
}

/** The VAA if the guardians have signed it, null if they have not yet. */
async function fetchVaaIfSigned(
  chainId: WormholeChainId,
  sequence: bigint,
): Promise<string | null> {
  const url = `${config.wormholescan}/v1/signed_vaa/${chainId}/${emitter(vaults[chainId].vault)}/${sequence}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const body = (await response.json()) as { vaaBytes?: string };
  return body.vaaBytes ? `0x${Buffer.from(body.vaaBytes, "base64").toString("hex")}` : null;
}

/** `VaaAlreadyConsumed(bytes32)`. */
const ALREADY_CONSUMED = "0x8665b3f2";

function isAlreadyConsumed(error: unknown): boolean {
  return JSON.stringify(error ?? "").includes(ALREADY_CONSUMED);
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
