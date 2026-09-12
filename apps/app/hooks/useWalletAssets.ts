"use client";
import { useQuery } from "@tanstack/react-query";
import { useBalance } from "wagmi";
import type { TokenSym } from "../components/ui/CoinBadge";
import { CREDITCOIN_CHAIN_ID, SEPOLIA_CHAIN_ID } from "../lib/comacard/contracts";
import { type Prices, readPrices } from "../lib/comacard/oracle";
import { useWallet } from "./useWallet";

/**
 * What the connected wallet actually holds, on both chains, priced by the oracle.
 *
 * This is what replaced Home's mock buckets. Balances come from wagmi, one read per chain with an
 * explicit `chainId`, so both show regardless of which network the wallet currently sits on. Prices
 * come from `lib/comacard/oracle.ts`: Chainlink for ETH, the Uniswap CTC/WETH pool for CTC.
 *
 * There is no fixture fallback. If a balance or a price cannot be read, that row's USD value is
 * unknown and the screen says so rather than showing a confident wrong number.
 */

export type WalletAsset = {
  token: TokenSym;
  /** What the chain calls it: tCTC on Creditcoin, ETH on Sepolia. */
  symbol: string;
  name: string;
  /** Rendered in the row's chip, so the user can see which chain a balance lives on. */
  network: string;
  /** 18-decimal base units, kept as bigint because wei does not survive Number(). */
  amount: bigint;
  decimals: number;
  /** null when the price read failed; the row renders "unavailable" rather than 0. */
  usd: number | null;
  priceUsd: number | null;
};

const WEI = 10n ** 18n;

/** bigint wei to a float, for display only. Never feed this back into a transaction. */
export const toNumber = (amount: bigint, decimals = 18): number =>
  Number((amount * 10_000n) / 10n ** BigInt(decimals)) / 10_000;

export function useWalletAssets(): {
  loading: boolean;
  assets: WalletAsset[];
  totalUsd: number | null;
  prices: Prices | null;
  priceError: boolean;
} {
  // Deliberately `useWallet()` and not wagmi's `useAccount()`. WalletProvider is the app's single
  // answer to "who is connected": it is what AuthGate gates on and what every screen already reads,
  // and under NEXT_PUBLIC_E2E it is backed by the stub rather than by a real connector. Reading the
  // account from wagmi here would make Home disagree with the rest of the app about whether anyone
  // is signed in. In real use the two are the same value, because WalletProvider gets it from wagmi.
  const { address: connected } = useWallet();
  const address = connected as `0x${string}` | undefined;

  const ctc = useBalance({ address, chainId: CREDITCOIN_CHAIN_ID, query: { enabled: !!address } });
  const eth = useBalance({ address, chainId: SEPOLIA_CHAIN_ID, query: { enabled: !!address } });

  // Prices move, balances mostly do not, so this refetches on its own clock rather than with them.
  const priceQuery = useQuery({
    queryKey: ["comacard", "prices"],
    queryFn: readPrices,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const prices = priceQuery.data ?? null;

  const value = (amount: bigint, priceUsd: number | null): number | null =>
    priceUsd === null ? null : (Number((amount * 10_000n) / WEI) / 10_000) * priceUsd;

  const ctcAmount = ctc.data?.value ?? 0n;
  const ethAmount = eth.data?.value ?? 0n;

  const assets: WalletAsset[] = [
    {
      token: "CTC",
      symbol: "tCTC",
      name: "Creditcoin",
      network: "Creditcoin Testnet",
      amount: ctcAmount,
      decimals: 18,
      priceUsd: prices?.ctcUsd ?? null,
      usd: value(ctcAmount, prices?.ctcUsd ?? null),
    },
    {
      token: "ETH",
      symbol: "ETH",
      name: "Ethereum",
      network: "Sepolia",
      amount: ethAmount,
      decimals: 18,
      priceUsd: prices?.ethUsd ?? null,
      usd: value(ethAmount, prices?.ethUsd ?? null),
    },
  ];

  // An unknown leg makes the total unknown. Summing the half we do know would understate it
  // silently, which is worse than admitting the gap.
  const totalUsd = assets.every((a) => a.usd !== null)
    ? assets.reduce((sum, a) => sum + (a.usd ?? 0), 0)
    : null;

  return {
    loading: !!address && (ctc.isLoading || eth.isLoading || priceQuery.isLoading),
    assets,
    totalUsd,
    prices,
    priceError: priceQuery.isError,
  };
}
