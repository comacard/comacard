"use client";
import { useQuery } from "@tanstack/react-query";
import { type Address, createPublicClient, type Hex, http } from "viem";
import {
  REMOTE_HUB,
  remoteHubAbi,
  WORMHOLE_CHAIN_NAMES,
  WORMHOLE_VAULTS,
  wormholeVaultAbi,
} from "../lib/comacard/contracts";
import {
  arbitrumSepolia,
  avalancheFuji,
  baseSepolia,
  bscTestnet,
  optimismSepolia,
} from "../lib/comacard/wagmi";
import { useWallet } from "./useWallet";

/**
 * Collateral deposited on chains Attestcoin cannot reach.
 *
 * Attestcoin proves Ethereum and Sepolia only. Everything else arrives by Wormhole: the asset is
 * held in a vault on its own chain, a signed message says so, and `WormholeCollateralHub` on
 * Creditcoin accounts for it. The asset never moves, which is the same promise the Attestcoin path
 * makes.
 *
 * **This exists because `collateralValueOf` already counts it.** The credit line adds the hub's
 * total to its own, so a screen reading only `listedTokens()` reports a limit backed by more than
 * the rows it lists — the figures disagree and neither is wrong. Reading the hub is what closes
 * that gap.
 *
 * Assets are keyed by `keccak256(chainId, token)`, never by address alone: USDC on Base and USDC on
 * Arbitrum are different assets in different vaults, and a depeg on one says nothing about the
 * other. The chain and token behind an id come from the `AssetListed` log rather than a table here,
 * for the same reason the Sepolia list is read from chain — listing is a governance call, and the
 * log cannot go stale.
 */

const CREDITCOIN_RPC =
  process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";

export type RemoteAsset = {
  /** `keccak256(wormholeChainId, token)`. The only safe cache key for one of these. */
  id: Hex;
  /** Wormhole's own chain id. Not an EVM chain id, and not an Attestcoin chain key. */
  wormholeChainId: number;
  /** Chain name for display, or the raw id when it is one we have no name for. */
  chainName: string;
  /** Token as `bytes32`; all zeroes for the chain's native coin. */
  token: Hex;
  /** True when the asset is the chain's native coin rather than an ERC20. */
  native: boolean;
  decimals: number;
  /** Credit-asset wei per ONE WHOLE unit, 18dp. */
  price: bigint;
  /** Credited on Creditcoin, in the asset's own base units. */
  credited: bigint;
  /** Held by the vault on its own chain. Exceeds `credited` while a message is in flight. */
  locked: bigint;
  /** What the wallet still holds on that chain and could lock. */
  available: bigint;
  /** True while a deposit has been locked but the guardians have not signed it across yet. */
  pending: boolean;
  /** The vault to lock into, and the EVM chain id the wallet has to be on to do it. */
  vault: Address | null;
  evmChainId: number | null;
  explorer: string | null;
};

/** Public RPCs for the chains a `WormholeVault` is deployed on, keyed by EVM chain id. */
const rpcOf = (chain: { rpcUrls: { default: { http: readonly string[] } } }): string =>
  chain.rpcUrls.default.http[0] as string;

const RPCS: Record<number, string> = {
  [baseSepolia.id as number]: rpcOf(baseSepolia),
  [arbitrumSepolia.id as number]: rpcOf(arbitrumSepolia),
  [optimismSepolia.id as number]: rpcOf(optimismSepolia),
  [bscTestnet.id as number]: rpcOf(bscTestnet),
  [avalancheFuji.id as number]: rpcOf(avalancheFuji),
};

const ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Blocks per `getLogs` call, and how far back to keep asking. Measured: 5,000 blocks answers in
 *  about a second on the Creditcoin RPC, while an unbounded query times out after forty. */
const LOG_CHUNK = 5_000n;
const LOG_SCAN_CHUNKS = 20;

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export function useRemoteCollateral(): {
  assets: RemoteAsset[];
  /** What the hub contributes to the limit, in credit-asset wei. */
  totalValue: bigint | null;
  loading: boolean;
  error: boolean;
  /** False when NEXT_PUBLIC_REMOTE_COLLATERAL_HUB is unset; every field then reads empty. */
  configured: boolean;
} {
  const { address } = useWallet();
  const wallet = address as Address | undefined;
  const configured = Boolean(REMOTE_HUB);

  const result = useQuery({
    queryKey: ["comacard", "remote-collateral", wallet],
    enabled: Boolean(wallet && REMOTE_HUB),
    refetchInterval: 30_000,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a fetch-with-cancellation effect body; the branching is the cancelled/error/empty handling the pattern requires
    queryFn: async (): Promise<{ assets: RemoteAsset[]; totalValue: bigint }> => {
      const who = wallet as Address;
      const hub = REMOTE_HUB as Address;
      const cc = createPublicClient({ transport: http(CREDITCOIN_RPC) });

      const [ids, totalValue, head] = await Promise.all([
        cc.readContract({ address: hub, abi: remoteHubAbi, functionName: "listedAssets" }),
        cc.readContract({ address: hub, abi: remoteHubAbi, functionName: "valueOf", args: [who] }),
        cc.getBlockNumber(),
      ]);

      /**
       * Where each listing came from, found by walking back in chunks.
       *
       * A single `fromBlock: 0` query is the obvious thing and it does not work: the Creditcoin RPC
       * spends forty seconds on it and then times out, which is exactly how this screen hung on a
       * skeleton. A 5,000-block window answers in about a second, so the scan walks backwards and
       * stops the moment every listed id has an origin — usually the first window, since listing is
       * a deployment-time act.
       */
      const origin = new Map<string, { chainId: number; token: Hex }>();
      const wanted = new Set(ids.map((id) => id.toLowerCase()));
      const assetListed = remoteHubAbi.find((entry) => entry.name === "AssetListed") as never;
      for (let i = 0n; i < BigInt(LOG_SCAN_CHUNKS) && origin.size < wanted.size; i++) {
        const to = head - i * LOG_CHUNK;
        if (to <= 0n) break;
        const from = to > LOG_CHUNK ? to - LOG_CHUNK + 1n : 0n;
        const logs = await cc
          .getLogs({ address: hub, event: assetListed, fromBlock: from, toBlock: to })
          .catch(() => []);
        for (const log of logs) {
          const args = (log as { args?: { assetId?: Hex; chainId?: number; token?: Hex } }).args;
          if (!args?.assetId) continue;
          const key = args.assetId.toLowerCase();
          // Walking backwards means the first hit is the most recent listing, so an earlier one
          // must not overwrite it: a re-list would otherwise resurrect its old decimals.
          if (origin.has(key)) continue;
          origin.set(key, {
            chainId: Number(args.chainId ?? 0),
            token: (args.token ?? ZERO32) as Hex,
          });
        }
        if (from === 0n) break;
      }

      const assets = await Promise.all(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: a fetch-with-cancellation effect body; the branching is the cancelled/error/empty handling the pattern requires
        ids.map(async (id) => {
          const [config, credited] = await Promise.all([
            cc.readContract({
              address: hub,
              abi: remoteHubAbi,
              functionName: "remoteAsset",
              args: [id],
            }),
            cc.readContract({
              address: hub,
              abi: remoteHubAbi,
              functionName: "collateralOf",
              args: [who, id],
            }),
          ]);
          const [price, decimals] = config;
          const from = origin.get(id.toLowerCase());
          const chainId = from?.chainId ?? 0;
          const token = from?.token ?? (ZERO32 as Hex);
          const native = token === ZERO32;
          const deployment = WORMHOLE_VAULTS[chainId];

          // What the vault on the far chain actually holds, and what the wallet could still lock.
          // Reading these on the source chain rather than from the indexer is what makes the
          // pending state work today: the indexer running now predates cross-chain deposits.
          let locked = 0n;
          let available = 0n;
          const rpc = deployment ? RPCS[deployment.evmChainId] : undefined;
          if (deployment && rpc) {
            const source = createPublicClient({ transport: http(rpc) });
            const asToken = `0x${token.slice(26)}` as Address;
            [locked, available] = await Promise.all([
              native
                ? source.readContract({
                    address: deployment.vault,
                    abi: wormholeVaultAbi,
                    functionName: "nativeBalanceOf",
                    args: [who],
                  })
                : source.readContract({
                    address: deployment.vault,
                    abi: wormholeVaultAbi,
                    functionName: "tokenBalanceOf",
                    args: [who, asToken],
                  }),
              native
                ? source.getBalance({ address: who })
                : source.readContract({
                    address: asToken,
                    abi: erc20BalanceAbi,
                    functionName: "balanceOf",
                    args: [who],
                  }),
            ]).catch(() => [0n, 0n] as [bigint, bigint]);
          }

          const asset: RemoteAsset = {
            id,
            wormholeChainId: chainId,
            chainName: WORMHOLE_CHAIN_NAMES[chainId] ?? `Chain ${chainId}`,
            token,
            native,
            decimals: Number(decimals),
            price,
            credited,
            locked,
            available,
            pending: locked > credited,
            vault: deployment?.vault ?? null,
            evmChainId: deployment?.evmChainId ?? null,
            explorer: deployment?.explorer ?? null,
          };
          return asset;
        }),
      );

      return { assets, totalValue };
    },
  });

  return {
    assets: result.data?.assets ?? [],
    totalValue: result.data?.totalValue ?? null,
    loading: Boolean(wallet) && configured && result.isLoading,
    error: result.isError,
    configured,
  };
}
