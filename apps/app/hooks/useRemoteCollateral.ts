"use client";
import { useQuery } from "@tanstack/react-query";
import { type Address, createPublicClient, type Hex, http } from "viem";
import {
  nativeAssetId,
  REMOTE_HUB,
  remoteHubAbi,
  WORMHOLE_CHAIN_NAMES,
  WORMHOLE_VAULTS,
  wormholeCoreAbi,
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
 * the rows it lists: the figures disagree and neither is wrong. Reading the hub is what closes
 * that gap.
 *
 * Assets are keyed by `keccak256(chainId, token)`, never by address alone: USDC on Base and USDC on
 * Arbitrum are different assets in different vaults, and a depeg on one says nothing about the
 * other. The chain and token behind an id come from the `AssetListed` log rather than a table here,
 * for the same reason the Sepolia list is read from chain: listing is a governance call, and the
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
  /** Approved for withdrawal by the relay and not yet taken. The borrower signs for this. */
  releasable: bigint;
  /** What the wallet still holds on that chain and could lock. */
  available: bigint;
  /** True while a deposit has been locked but the guardians have not signed it across yet. */
  pending: boolean;
  /**
   * Wormhole's publish fee on that chain, in its native wei.
   *
   * Read here because the far chain is already being read here. A screen that wanted it was
   * otherwise chaining two `useReadContract` calls of its own, `WORMHOLE()` then `messageFee()`,
   * which is a second way to ask the same question and one more thing to be wrong about.
   * `lockNative` reverts with `FeeNotCovered` when the value does not clear it, so anything
   * building a transaction needs this figure and not a guess at it.
   */
  fee: bigint;
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

/**
 * Where a listing came from, remembered between visits.
 *
 * **This cannot go stale, and that is a property of the id rather than a hope.** The hub files an
 * asset under `keccak256(abi.encodePacked(chainId, token))`, so an id determines its chain and token
 * exactly. Two different origins cannot share an id, and re-listing the same pair produces the same
 * id again. Nothing else is cached here: price and decimals are read from `remoteAsset()` on every
 * pass, because those the hub can change.
 *
 * What it saves is the log scan, which is the slow part by a wide margin. `eth_getLogs` on the
 * Creditcoin RPC costs three to six seconds per 5,000-block window and the ERC20 listings are the
 * only reason it runs at all, so without this a visitor waits on it every time even though the
 * answer has not changed since deployment.
 *
 * Every access is wrapped: `localStorage` throws outright in some privacy modes, and a collateral
 * list that fails to render because a cache read was refused would be a much worse bug than a slow
 * one. A miss simply means the scan runs.
 */
const ORIGIN_CACHE_KEY = "soro.remote.origin.v1";

function readOriginCache(): Map<string, { chainId: number; token: Hex }> {
  try {
    const raw = window.localStorage.getItem(ORIGIN_CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, { chainId: number; token: string }>;
    const out = new Map<string, { chainId: number; token: Hex }>();
    for (const [key, value] of Object.entries(parsed)) {
      // A hand-edited or half-written entry must not become an asset attributed to chain 0.
      if (typeof value?.chainId !== "number" || typeof value?.token !== "string") continue;
      if (!WORMHOLE_CHAIN_NAMES[value.chainId]) continue;
      out.set(key, { chainId: value.chainId, token: value.token as Hex });
    }
    return out;
  } catch {
    return new Map();
  }
}

function writeOriginCache(origin: Map<string, { chainId: number; token: Hex }>): void {
  try {
    window.localStorage.setItem(ORIGIN_CACHE_KEY, JSON.stringify(Object.fromEntries(origin)));
  } catch {
    // Full, or refused. The scan runs next time, which is the behaviour before this existed.
  }
}

const LOG_CHUNK = 5_000n;
const LOG_SCAN_CHUNKS = 20;
/** Windows fetched per round trip. See the note in the scan for the measurement behind this. */
const LOG_SCAN_BATCH = 4;
/** The chains with a vault, plus Sepolia. Native ids are derived for these before any log call. */
const KNOWN_WORMHOLE_CHAINS = [4, 6, 10002, 10003, 10004, 10005];

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
  /** Re-read after a write. */
  refresh: () => void;
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
       * stops the moment every listed id has an origin: usually the first window, since listing is
       * a deployment-time act.
       */
      const origin = new Map<string, { chainId: number; token: Hex }>();
      const wanted = new Set(ids.map((id) => id.toLowerCase()));

      /**
       * The native assets, filled in for free before a single log is fetched.
       *
       * `assetId` is `keccak256(encodePacked(chainId, token))` and a native token is 32 zero bytes,
       * so every native listing's id can be computed here. Five of the seven assets on the live hub
       * are native, including BNB, and this is what stops them waiting on the scan below.
       */
      for (const chainId of KNOWN_WORMHOLE_CHAINS) {
        const key = nativeAssetId(chainId).toLowerCase();
        if (wanted.has(key)) origin.set(key, { chainId, token: ZERO32 as Hex });
      }

      // Anything seen on a previous visit. See `readOriginCache` for why this cannot go stale.
      for (const [key, value] of readOriginCache()) {
        if (wanted.has(key) && !origin.has(key)) origin.set(key, value);
      }

      const assetListed = remoteHubAbi.find((entry) => entry.name === "AssetListed") as never;
      /**
       * Whatever is left is an ERC20, whose address cannot be guessed, so the logs are the only
       * record. Windows go out in batches rather than one at a time.
       *
       * Serially, each window costs three to six seconds on this RPC and the second one only starts
       * after the first has answered. Measured 13 September 2026: 5.77s then 3.11s for the two
       * windows a full scan needed. A batch of four costs one round trip for the same reach, and
       * the loop still stops as soon as every id has an origin, so the common case of everything
       * being in the first window is unchanged.
       */
      for (
        let batch = 0;
        batch < LOG_SCAN_CHUNKS / LOG_SCAN_BATCH && origin.size < wanted.size;
        batch++
      ) {
        const windows: { from: bigint; to: bigint }[] = [];
        for (let i = 0; i < LOG_SCAN_BATCH; i++) {
          const to = head - BigInt(batch * LOG_SCAN_BATCH + i) * LOG_CHUNK;
          if (to <= 0n) break;
          windows.push({ from: to > LOG_CHUNK ? to - LOG_CHUNK + 1n : 0n, to });
        }
        if (windows.length === 0) break;

        const pages = await Promise.all(
          windows.map((w) =>
            cc
              .getLogs({ address: hub, event: assetListed, fromBlock: w.from, toBlock: w.to })
              .catch(() => []),
          ),
        );

        // Newest window first, and newest log within it last, so the most recent listing is the one
        // that survives: a re-list must not be overwritten by the entry it replaced.
        for (const logs of pages) {
          for (const log of logs) {
            const args = (log as { args?: { assetId?: Hex; chainId?: number; token?: Hex } }).args;
            if (!args?.assetId) continue;
            const key = args.assetId.toLowerCase();
            if (origin.has(key)) continue;
            origin.set(key, {
              chainId: Number(args.chainId ?? 0),
              token: (args.token ?? ZERO32) as Hex,
            });
          }
        }
        if (windows[windows.length - 1].from === 0n) break;
      }

      writeOriginCache(origin);

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
          // Approved by the relay and waiting for the borrower's own transaction. The relay grants
          // permission; it never pushes funds, so a release is not finished when the guardians have
          // signed it: there is a second signature to collect.
          let releasable = 0n;
          let fee = 0n;
          const rpc = deployment ? RPCS[deployment.evmChainId] : undefined;
          if (deployment && rpc) {
            const source = createPublicClient({ transport: http(rpc) });
            const asToken = `0x${token.slice(26)}` as Address;

            // The fee is two reads deep (`WORMHOLE()` then `messageFee()`) and rides in the same
            // `Promise.all` as the balances, so it is awaited with them rather than racing them. It
            // is zero on these testnets today, which is exactly why it is read and not assumed.
            const feeRead = source
              .readContract({
                address: deployment.vault,
                abi: wormholeVaultAbi,
                functionName: "WORMHOLE",
              })
              .then((core) =>
                source.readContract({
                  address: core as Address,
                  abi: wormholeCoreAbi,
                  functionName: "messageFee",
                }),
              )
              .catch(() => 0n);

            [locked, available, releasable, fee] = await Promise.all([
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
              native
                ? source.readContract({
                    address: deployment.vault,
                    abi: wormholeVaultAbi,
                    functionName: "nativeReleasable",
                    args: [who],
                  })
                : source.readContract({
                    address: deployment.vault,
                    abi: wormholeVaultAbi,
                    functionName: "tokenReleasable",
                    args: [who, asToken],
                  }),
              feeRead,
            ]).catch(() => [0n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint]);
          }

          const asset: RemoteAsset = {
            fee,
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
            releasable,
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
    /** Re-read after a write. A release changes both the hub's credit and the vault's approval, and
     *  the 30s poll is too slow to be the only thing that notices. */
    refresh: () => {
      void result.refetch();
    },
  };
}
