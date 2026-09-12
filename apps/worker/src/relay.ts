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

/** Every deposit a chain's vault has published, oldest first. */
export async function pendingDeposits(chainId: WormholeChainId, fromBlock: number) {
  const { JsonRpcProvider } = await import("ethers");
  const provider = new JsonRpcProvider(vaults[chainId].rpc);
  const vault = new Contract(vaults[chainId].vault, VAULT_ABI, provider);
  const filter = vault.filters.Locked;
  if (!filter) throw new Error("Locked event missing from the vault ABI");
  const logs = await vault.queryFilter(filter(), fromBlock);

  return logs.map((log) => ({
    account: (log as unknown as { args: string[] }).args[0],
    token: (log as unknown as { args: string[] }).args[1],
    amount: (log as unknown as { args: bigint[] }).args[2],
    sequence: (log as unknown as { args: bigint[] }).args[3],
    block: log.blockNumber,
  }));
}

if (import.meta.main) {
  const chainId = Number(process.argv[2] ?? 10004) as WormholeChainId;
  const sequence = BigInt(process.argv[3] ?? 0);

  if (!vaults[chainId]) {
    console.error(`unknown chain ${chainId}. known: ${Object.keys(vaults).join(", ")}`);
    process.exit(1);
  }

  const wallet = new Wallet(process.env.WALLET_PK ?? "", creditcoin());
  console.log(`waiting for ${vaults[chainId].name} sequence ${sequence} to be signed…`);

  const vaa = await fetchVaa(chainId, sequence);
  console.log(`signed, ${(vaa.length - 2) / 2} bytes`);

  const hash = await deliver(vaa, wallet);
  console.log(`credited on Creditcoin → ${hash}`);
}
