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
   *  fetching the VAA and delivering it is our own job. */
  wormholescan: process.env.WORMHOLESCAN_URL ?? "https://api.testnet.wormholescan.io",

  /** Creditcoin-internal source chain ids. Sepolia is 1, Ethereum mainnet is 3. */
  sepoliaChainKey: Number(process.env.SEPOLIA_CHAIN_KEY ?? 1),
  mainnetChainKey: Number(process.env.MAINNET_CHAIN_KEY ?? 3),

  /** How far back to look on a cold start. */
  lookbackBlocks: Number(process.env.LOOKBACK_BLOCKS ?? 5_000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 20_000),
} as const;

/** Every chain a WormholeVault runs on. Testnets only. */
export const vaults = {
  10004: {
    name: "Base Sepolia",
    rpc: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
    vault: process.env.BASE_SEPOLIA_VAULT ?? "0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf",
  },
  10003: {
    name: "Arbitrum Sepolia",
    rpc: process.env.ARBITRUM_SEPOLIA_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc",
    vault: process.env.ARBITRUM_SEPOLIA_VAULT ?? "0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30",
  },
} as const satisfies Record<number, { name: string; rpc: string; vault: string }>;

export type WormholeChainId = keyof typeof vaults;

export const sepolia = () => new JsonRpcProvider(config.sepoliaRpc);
export const mainnet = () => new JsonRpcProvider(config.mainnetRpc);
export const creditcoin = () => new JsonRpcProvider(config.creditcoinRpc);

export function signer(): Wallet {
  return new Wallet(required("WALLET_PK"), creditcoin());
}
