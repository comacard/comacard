"use client";
import { useQuery } from "@tanstack/react-query";
import { type Address, createPublicClient, http } from "viem";
import {
  CREDIT_LINE,
  creditLineAbi,
  erc20Abi,
  SOURCE_VAULT,
  sourceVaultAbi,
  testTokenAbi,
} from "../lib/comacard/contracts";
import { useWallet } from "./useWallet";

/**
 * Everything backing this wallet's credit limit: the native lock plus every listed ERC20.
 *
 * Two chains and two states per asset, and conflating them is the mistake to avoid. Collateral
 * **locked** on Sepolia is not yet collateral **proved** on Creditcoin: Attestcoin runs seven to
 * nine minutes behind, so between a lock and its proof the vault says you have it and the credit
 * line says you do not. Both numbers are read and reported separately, because during that window
 * they genuinely disagree and only one of them raises a limit.
 *
 * The token list is read from `listedTokens()` rather than an env var. Listing a token is a
 * governance call on the credit line, so the chain is the only source that cannot go stale.
 *
 * `totalValue` comes from `collateralValueOf`, not from summing here. Each token is priced per
 * WHOLE token against its own decimals, and re-deriving that in TypeScript is how a 6-decimal
 * stablecoin ends up valued at a trillionth of its worth.
 */

const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const CREDITCOIN_RPC =
  process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";

export type CollateralAsset = {
  /** Null for the native asset, which has no token address. */
  token: Address | null;
  symbol: string;
  /** The ERC20's own `name()`, or "Ethereum" for the native asset. */
  name: string;
  /** URL-safe symbol, the segment `/deposit/[sym]` is addressed by. */
  slug: string;
  decimals: number;
  /** Held by the vault on Sepolia, in the asset's own base units. */
  locked: bigint;
  /** Proved on Creditcoin through Attestcoin. Lags `locked` by the attestation window. */
  proved: bigint;
  /** What the wallet still holds and could lock, in base units. */
  available: bigint;
  /** Credit-asset wei per ONE WHOLE unit, 18dp. */
  price: bigint;
  /** True while a lock has not finished crossing. */
  crossing: boolean;
  /** True when the token exposes `TestToken.faucet`, so a zero balance is not a dead end. */
  faucetable: boolean;
};

/** Find the asset a `/deposit/[sym]` segment addresses. Case-insensitive; null when unknown. */
export function assetBySlug(assets: CollateralAsset[], slug: string): CollateralAsset | null {
  const wanted = slug.toLowerCase();
  return assets.find((asset) => asset.slug === wanted) ?? null;
}

export function useCollateral(): {
  assets: CollateralAsset[];
  /** Sum the limit is actually derived from, in credit-asset wei. */
  totalValue: bigint | null;
  loading: boolean;
  error: boolean;
} {
  const { address } = useWallet();
  const wallet = address as Address | undefined;

  const result = useQuery({
    queryKey: ["comacard", "collateral", wallet],
    enabled: Boolean(wallet && CREDIT_LINE && SOURCE_VAULT),
    refetchInterval: 30_000,
    queryFn: async (): Promise<{ assets: CollateralAsset[]; totalValue: bigint }> => {
      const who = wallet as Address;
      const line = CREDIT_LINE as Address;
      const vault = SOURCE_VAULT as Address;

      const cc = createPublicClient({ transport: http(CREDITCOIN_RPC) });
      const sep = createPublicClient({ transport: http(SEPOLIA_RPC) });

      const [tokens, totalValue, account, nativeLocked, nativeBalance, nativePrice] =
        await Promise.all([
          cc.readContract({ address: line, abi: creditLineAbi, functionName: "listedTokens" }),
          cc.readContract({
            address: line,
            abi: creditLineAbi,
            functionName: "collateralValueOf",
            args: [who],
          }),
          cc.readContract({
            address: line,
            abi: creditLineAbi,
            functionName: "accountOf",
            args: [who],
          }),
          sep.readContract({
            address: vault,
            abi: sourceVaultAbi,
            functionName: "balanceOf",
            args: [who],
          }),
          sep.getBalance({ address: who }),
          cc.readContract({ address: line, abi: creditLineAbi, functionName: "collateralPrice" }),
        ]);
      const perToken = await Promise.all(
        tokens.map(async (token) => {
          const [config, proved, locked, available, symbol, name, faucetLimit] = await Promise.all([
            cc.readContract({
              address: line,
              abi: creditLineAbi,
              functionName: "tokenConfig",
              args: [token],
            }),
            cc.readContract({
              address: line,
              abi: creditLineAbi,
              functionName: "tokenCollateral",
              args: [who, token],
            }),
            sep.readContract({
              address: vault,
              abi: sourceVaultAbi,
              functionName: "tokenBalanceOf",
              args: [who, token],
            }),
            sep.readContract({
              address: token,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [who],
            }),
            sep
              .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
              .catch(() => "TOKEN"),
            sep
              .readContract({ address: token, abi: erc20Abi, functionName: "name" })
              .catch(() => ""),
            // Asked rather than assumed. Every token listed on this deployment happens to be a
            // TestToken, but that is a fact about today's listing, not about the interface, and a
            // mint button on a token with no faucet would revert in the user's wallet.
            sep
              .readContract({ address: token, abi: testTokenAbi, functionName: "FAUCET_LIMIT" })
              .then(() => true)
              .catch(() => false),
          ]);
          const [price, decimals] = config;
          const asset: CollateralAsset = {
            token,
            symbol,
            name: name || symbol,
            slug: symbol.toLowerCase(),
            decimals: Number(decimals),
            locked,
            proved,
            available,
            price,
            crossing: locked > proved,
            faucetable: faucetLimit,
          };
          return asset;
        }),
      );

      // Native ETH leads: it is the collateral the product started with, and the one the demo uses.
      const nativeProved = account.collateral;
      const native: CollateralAsset = {
        token: null,
        symbol: "ETH",
        name: "Ethereum",
        slug: "eth",
        decimals: 18,
        locked: nativeLocked,
        proved: nativeProved,
        available: nativeBalance,
        price: nativePrice,
        // Sepolia ETH has no faucet this app can call: it comes from Google Cloud's, off-site.
        faucetable: false,
        crossing: nativeLocked > nativeProved,
      };

      return { assets: [native, ...perToken], totalValue };
    },
  });

  return {
    assets: result.data?.assets ?? [],
    totalValue: result.data?.totalValue ?? null,
    loading: Boolean(wallet) && result.isLoading,
    error: result.isError,
  };
}
