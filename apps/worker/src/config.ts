import { JsonRpcProvider, Wallet } from "ethers";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

export const config = {
  sepoliaRpc: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
  mainnetRpc: process.env.MAINNET_RPC_URL ?? "https://ethereum-rpc.publicnode.com",
  creditcoinRpc: process.env.CREDITCOIN_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network",
  proofBuilderUrl:
    process.env.PROOF_BUILDER_URL ?? "https://proof-gen-api.cc3-testnet.creditcoin.network",

  sourceVault: process.env.SOURCE_VAULT_ADDRESS ?? "0x911290c37E9558C704870f4C44CBdEA1B2B33303",
  creditLine: process.env.ASC_CREDIT_LINE_ADDRESS ?? "0x18052272cC69113DE2b45d2BDB4E1fB287F4E906",
  collateralHub: process.env.COLLATERAL_HUB_ADDRESS ?? "0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f",

  /** Where signed messages are served. Creditcoin has no Wormhole relayer, so
   *  fetching the VAA and delivering it is our own job — in both directions. */
  wormholescan: process.env.WORMHOLESCAN_URL ?? "https://api.testnet.wormholescan.io",

  /** Creditcoin's own Wormhole chain id, the emitter of every release. */
  creditcoinWormholeChainId: Number(process.env.CREDITCOIN_WORMHOLE_CHAIN_ID ?? 59),

  /** Creditcoin-internal source chain ids. Sepolia is 1, Ethereum mainnet is 3. */
  sepoliaChainKey: Number(process.env.SEPOLIA_CHAIN_KEY ?? 1),
  mainnetChainKey: Number(process.env.MAINNET_CHAIN_KEY ?? 3),

  /** How far back to look on a cold start. */
  lookbackBlocks: Number(process.env.LOOKBACK_BLOCKS ?? 5_000),

  /** The same, for the Wormhole vaults. */
  relayLookbackBlocks: Number(process.env.RELAY_LOOKBACK_BLOCKS ?? 5_000),

  /** How many sweeps a release may go unaccepted before the worker stops
   *  offering it. Past this it needs a person, not another transaction. */
  relayMaxAttempts: Number(process.env.RELAY_MAX_ATTEMPTS ?? 3),

  /** Largest range a public RPC will answer. Base Sepolia refuses anything over
   *  10,000 with a 413; Creditcoin times out well before that. */
  logWindowBlocks: Number(process.env.LOG_WINDOW_BLOCKS ?? 9_000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 20_000),
} as const;

/** Every chain a WormholeVault runs on. Testnets only. */
export const vaults = {
  10004: {
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    vault: process.env.BASE_SEPOLIA_VAULT ?? "0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf",
    relay: process.env.BASE_SEPOLIA_RELAY ?? "0x4ab591d70462c69792E35d7C61f118BEFd45e62e",
  },
  10003: {
    name: "Arbitrum Sepolia",
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
    vault: process.env.ARBITRUM_SEPOLIA_VAULT ?? "0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30",
    relay: process.env.ARBITRUM_SEPOLIA_RELAY ?? "0xFcb45153DbA2fAd0864E1e24293C33AB99b507eB",
  },
  10005: {
    name: "Optimism Sepolia",
    rpc: process.env.OPTIMISM_SEPOLIA_RPC_URL ?? "https://sepolia.optimism.io",
    vault: process.env.OPTIMISM_SEPOLIA_VAULT ?? "0xCaBFa324576c655D0276647A7f0aF5e779123e0B",
    relay: process.env.OPTIMISM_SEPOLIA_RELAY ?? "0xE3965709c657748501bB33a55AEFdE7F9622FD5E",
  },
  4: {
    name: "BSC Testnet",
    rpc: process.env.BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-rpc.publicnode.com",
    vault: process.env.BSC_TESTNET_VAULT ?? "0x9d8B6852705dD7585B3907244d603547a4eA32d6",
    relay: process.env.BSC_TESTNET_RELAY ?? "0x740B0c07c3291FECF5e852F86652Ffbb575A2378",
  },
  6: {
    name: "Avalanche Fuji",
    rpc: process.env.AVALANCHE_FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
    vault: process.env.AVALANCHE_FUJI_VAULT ?? "0x7D68B54a6eDd92F9e6f17E75dbE4d9838cD88a1b",
    relay: process.env.AVALANCHE_FUJI_RELAY ?? "0xDE88C384AC8347F8C8B78C7DDE40432B95F629E1",
  },
} as const satisfies Record<number, { name: string; rpc: string; vault: string; relay: string }>;

export type WormholeChainId = keyof typeof vaults;

export const sepolia = () => new JsonRpcProvider(config.sepoliaRpc);
export const mainnet = () => new JsonRpcProvider(config.mainnetRpc);
export const creditcoin = () => new JsonRpcProvider(config.creditcoinRpc);

export function signer(): Wallet {
  return new Wallet(required("WALLET_PK"), creditcoin());
}
