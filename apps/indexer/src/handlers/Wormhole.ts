import { type EvmOnEventContext, indexer } from "envio";
import { encodePacked, keccak256, pad } from "viem";

import { getOrCreateAccount, logId } from "../shared";

/**
 * Collateral deposited on chains Attestcoin cannot reach.
 *
 * The shape mirrors the Attestcoin path deliberately: the remote chain records
 * what was locked, Creditcoin records what was credited, and they are separate
 * columns because they are separate facts. Here the gap between them is wider —
 * the vaults publish at finalized consistency, so an L2 deposit waits on
 * Ethereum finality — and a cardholder staring at that gap is looking at
 * guardian latency, not a bug.
 */

/** EVM chain id → Wormhole chain id. The two number spaces are unrelated. */
const WORMHOLE_CHAIN_ID: Record<number, number> = {
  84532: 10_004, // Base Sepolia
  421614: 10_003, // Arbitrum Sepolia
};

/**
 * The contract's own asset identity, recomputed here.
 *
 * CollateralMessage.assetId is keccak256(abi.encodePacked(uint16, bytes32)).
 * The vault event only carries the token address, so the id has to be derived
 * rather than read — and it has to be derived exactly the same way, or the
 * lock and the credit land on two different rows.
 */
function assetId(wormholeChainId: number, token: string): string {
  return keccak256(
    encodePacked(
      ["uint16", "bytes32"],
      [wormholeChainId, pad(token as `0x${string}`, { size: 32 })],
    ),
  );
}

async function position(
  context: EvmOnEventContext,
  account: string,
  asset: string,
  timestamp: bigint,
) {
  const id = `${account}-${asset}`;
  return (
    (await context.RemotePosition.get(id)) ?? {
      id,
      account,
      asset_id: asset,
      locked: 0n,
      credited: 0n,
      releasable: 0n,
      lastActiveAt: timestamp,
    }
  );
}

const minus = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

// ---------------- Creditcoin: what the hub accepts ----------------

indexer.onEvent(
  { contract: "WormholeCollateralHub", event: "AssetListed" },
  async ({ event, context }) => {
    const at = BigInt(event.block.timestamp);
    context.RemoteAsset.set({
      id: event.params.assetId.toLowerCase(),
      wormholeChainId: Number(event.params.chainId),
      // Addresses travel as bytes32 so non-EVM chains fit; trim to 20 bytes for
      // display, since every chain we accept today is an EVM one.
      token: `0x${event.params.token.slice(-40)}`.toLowerCase(),
      decimals: Number(event.params.decimals),
      price: event.params.price,
      listedAt: at,
      pricedAt: at,
    });
  },
);

indexer.onEvent(
  { contract: "WormholeCollateralHub", event: "AssetPriceChanged" },
  async ({ event, context }) => {
    const id = event.params.assetId.toLowerCase();
    const asset = await context.RemoteAsset.get(id);
    if (!asset) return;
    context.RemoteAsset.set({
      ...asset,
      price: event.params.to,
      pricedAt: BigInt(event.block.timestamp),
    });
  },
);

// ---------------- Creditcoin: what was credited ----------------

indexer.onEvent(
  { contract: "WormholeCollateralHub", event: "RemoteCollateralCredited" },
  async ({ event, context }) => {
    const account = event.params.account.toLowerCase();
    const asset = event.params.assetId.toLowerCase();
    const at = BigInt(event.block.timestamp);

    // The account may be brand new: a borrower can arrive from Base without
    // ever having touched Sepolia.
    const existing = await getOrCreateAccount(context, account, at);
    context.Account.set({ ...existing, lastActiveAt: at });

    const p = await position(context, account, asset, at);
    context.RemotePosition.set({
      ...p,
      credited: p.credited + event.params.amount,
      lastActiveAt: at,
    });
  },
);

// ---------------- The remote chains: what was locked ----------------

indexer.onEvent({ contract: "WormholeVault", event: "Locked" }, async ({ event, context }) => {
  const chainId = WORMHOLE_CHAIN_ID[event.chainId];
  if (chainId === undefined) return;

  const account = event.params.account.toLowerCase();
  const asset = assetId(chainId, event.params.token).toLowerCase();
  const at = BigInt(event.block.timestamp);

  const p = await position(context, account, asset, at);
  context.RemotePosition.set({ ...p, locked: p.locked + event.params.amount, lastActiveAt: at });

  context.RemoteDeposit.set({
    id: `${chainId}-${event.params.sequence}`,
    account,
    asset_id: asset,
    amount: event.params.amount,
    sequence: BigInt(event.params.sequence),
    lockedAt: at,
    lockBlock: BigInt(event.block.number),
    lockTxHash: event.transaction.hash,
    // Null until the guardians sign and somebody delivers the message.
    creditedAt: undefined,
    creditTxHash: undefined,
    vaaHash: undefined,
  });
});

indexer.onEvent({ contract: "WormholeVault", event: "Unlocked" }, async ({ event, context }) => {
  const chainId = WORMHOLE_CHAIN_ID[event.chainId];
  if (chainId === undefined) return;

  const account = event.params.account.toLowerCase();
  const asset = assetId(chainId, event.params.token).toLowerCase();
  const at = BigInt(event.block.timestamp);

  const p = await position(context, account, asset, at);
  context.RemotePosition.set({
    ...p,
    locked: minus(p.locked, event.params.amount),
    releasable: minus(p.releasable, event.params.amount),
    lastActiveAt: at,
  });
});

indexer.onEvent(
  { contract: "WormholeVault", event: "ReleaseApproved" },
  async ({ event, context }) => {
    const chainId = WORMHOLE_CHAIN_ID[event.chainId];
    if (chainId === undefined) return;

    const account = event.params.account.toLowerCase();
    const asset = assetId(chainId, event.params.token).toLowerCase();
    const at = BigInt(event.block.timestamp);

    const p = await position(context, account, asset, at);
    // The contract sets the allowance rather than adding to it, so this does
    // the same. Mirroring the contract is the only way the two stay equal.
    context.RemotePosition.set({ ...p, releasable: event.params.amount, lastActiveAt: at });
  },
);

// A stable id per log, kept for parity with the other handlers.
void logId;
