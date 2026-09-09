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

  /** Creditcoin-internal source chain ids. Sepolia is 1, Ethereum mainnet is 3. */
  sepoliaChainKey: Number(process.env.SEPOLIA_CHAIN_KEY ?? 1),
  mainnetChainKey: Number(process.env.MAINNET_CHAIN_KEY ?? 3),

  /** How far back to look on a cold start. */
  lookbackBlocks: Number(process.env.LOOKBACK_BLOCKS ?? 5_000),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 20_000),
} as const;

export const sepolia = () => new JsonRpcProvider(config.sepoliaRpc);
export const mainnet = () => new JsonRpcProvider(config.mainnetRpc);
export const creditcoin = () => new JsonRpcProvider(config.creditcoinRpc);

export function signer(): Wallet {
  return new Wallet(required("WALLET_PK"), creditcoin());
}
