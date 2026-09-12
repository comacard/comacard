import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
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
 * Base Sepolia. Collateral locked here reaches Creditcoin through Wormhole, not Attestcoin.
 *
 * Attestcoin proves Ethereum and Sepolia and nothing else, so every other chain needs a different
 * carrier. The asset still never moves: a `WormholeVault` holds it here and publishes a signed
 * message saying so.
 */
export const baseSepolia: AppKitNetwork = {
  id: 84532,
  caipNetworkId: "eip155:84532",
  chainNamespace: "eip155",
  name: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://base-sepolia-rpc.publicnode.com"] },
    chainDefault: { http: ["https://base-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
  testnet: true,
};

/** Arbitrum Sepolia. Same Wormhole path as Base. */
export const arbitrumSepolia: AppKitNetwork = {
  id: 421614,
  caipNetworkId: "eip155:421614",
  chainNamespace: "eip155",
  name: "Arbitrum Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://arbitrum-sepolia-rpc.publicnode.com"] },
    chainDefault: { http: ["https://arbitrum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "Arbiscan", url: "https://sepolia.arbiscan.io" } },
  testnet: true,
};

/** Optimism Sepolia. Wormhole 10005. */
export const optimismSepolia: AppKitNetwork = {
  id: 11155420,
  caipNetworkId: "eip155:11155420",
  chainNamespace: "eip155",
  name: "Optimism Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://optimism-sepolia-rpc.publicnode.com"] },
    chainDefault: { http: ["https://optimism-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia-optimism.etherscan.io" },
  },
  testnet: true,
};

/**
 * BSC Testnet. Wormhole **4**, not 10004-anything.
 *
 * Wormhole gave its later testnets ids in the 10000s (Sepolia 10002, Arbitrum 10003, Base 10004,
 * Optimism 10005) but BSC Testnet and Avalanche Fuji predate that and reuse their mainnet ids, 4
 * and 6. Guessing the pattern puts Fuji at 10006, which is Holesky — a different chain whose vault
 * would be read at the wrong address. Both numbers here are the ones `apps/worker/src/config.ts`
 * and the indexer's chain map use.
 */
export const bscTestnet: AppKitNetwork = {
  id: 97,
  caipNetworkId: "eip155:97",
  chainNamespace: "eip155",
  name: "BSC Testnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://bsc-testnet-rpc.publicnode.com"] },
    chainDefault: { http: ["https://bsc-testnet-rpc.publicnode.com"] },
  },
  blockExplorers: { default: { name: "BscScan", url: "https://testnet.bscscan.com" } },
  testnet: true,
};

/** Avalanche Fuji. Wormhole **6** — see the note on `bscTestnet`. */
export const avalancheFuji: AppKitNetwork = {
  id: 43113,
  caipNetworkId: "eip155:43113",
  chainNamespace: "eip155",
  name: "Avalanche Fuji",
  nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] },
    chainDefault: { http: ["https://api.avax-test.network/ext/bc/C/rpc"] },
  },
  blockExplorers: { default: { name: "Snowtrace", url: "https://testnet.snowtrace.io" } },
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
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  sepolia,
  creditcoinTestnet,
  baseSepolia,
  arbitrumSepolia,
  optimismSepolia,
  bscTestnet,
  avalancheFuji,
];

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
