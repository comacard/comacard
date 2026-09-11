import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import type { AppKitNetwork } from "@reown/appkit/networks";
// Imported so the `declare module "wagmi"` augmentation below has a resolved module to attach to;
// TypeScript cannot augment a module the file never loads.
import type { Config } from "wagmi";

/**
 * The wagmi side of the wallet layer. Module scope on purpose: `WagmiAdapter` and `createAppKit`
 * must each run exactly once per page load, and building either inside a component gives you two
 * instances and a connection that drops on re-render.
 *
 * **Wagmi or ethers, never both.** Both adapters register the `eip155` namespace with AppKit, so
 * installing the pair silently breaks connection state. `@reown/appkit-adapter-ethers` was removed
 * when this landed; do not add it back alongside this file.
 *
 * Networks are declared here rather than imported from `viem/chains` because AppKit needs the CAIP
 * shape (`caipNetworkId`, `chainNamespace`) that plain viem chains do not carry, and because
 * Creditcoin is not in viem's chain list at all.
 */

/** Creditcoin CC3 testnet. Chain id and RPC match `contracts/foundry.toml`. */
export const creditcoinTestnet: AppKitNetwork = {
  id: 102031,
  caipNetworkId: "eip155:102031",
  chainNamespace: "eip155",
  name: "Creditcoin Testnet",
  // The explorer and the wallets both show this, and tCTC is what the faucet calls it.
  nativeCurrency: { name: "Testnet CTC", symbol: "tCTC", decimals: 18 },
  // `default` feeds the modal and viem's transport; `chainDefault` is what AppKit's
  // `wallet_addEthereumChain` reads. Omit the second and the add-chain prompt sends an empty
  // rpcUrls array, which every wallet rejects.
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
    chainDefault: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
};

/** Where the collateral is locked. Attestcoin proves this chain's events on Creditcoin. */
export const sepolia: AppKitNetwork = {
  id: 11155111,
  caipNetworkId: "eip155:11155111",
  chainNamespace: "eip155",
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
    chainDefault: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "Etherscan", url: "https://sepolia.etherscan.io" } },
  testnet: true,
};

/**
 * Sepolia leads, and that ordering is load-bearing rather than alphabetical.
 *
 * AppKit connects on whichever network is active and its adapter fires `wallet_switchEthereumChain`
 * during connect without ever offering to ADD an unknown chain. Lead with Creditcoin and every
 * wallet that has not already added CC3 fails the connect outright with "Connection declined".
 * Sepolia ships in every wallet, so that switch always succeeds; `selectCreditcoin()` in
 * `lib/wallet-reown.ts` moves the session over afterwards, through the one code path that does
 * fall back to `wallet_addEthereumChain`.
 */
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, creditcoinTestnet];

export const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "";

export const metadata = {
  name: "Comacard",
  description: "A card sized by what you have repaid, not what you hold.",
  // Wallets verify this against the origin they were opened from.
  url: typeof window === "undefined" ? "https://app.comacard.xyz" : window.location.origin,
  icons: ["https://app.comacard.xyz/brand/comacard-logo.png"],
};

/** `ssr: true` is required under the App Router: without it wagmi hydrates from an empty state and
 *  the first client render disagrees with the server's. */
export const wagmiAdapter = new WagmiAdapter({ networks, projectId, ssr: true });

export const wagmiConfig: Config = wagmiAdapter.wagmiConfig;

/** Lets `useConfig()`-free call sites reach the same config, and gives wagmi's own types the
 *  concrete config so `useReadContract` infers chain ids instead of `number`. */
declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
