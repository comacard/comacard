import type { Address } from "viem";
import { creditcoinTestnet, sepolia } from "./wagmi";

/**
 * The contract surface the app is allowed to touch, and nothing else.
 *
 * Five calls, deliberately. Everything a cardholder can sign is here; everything else on those
 * contracts is operator-only (`approveRelease`, `placeReleaseHold`, `setCollateralPrice`,
 * `deployLiquidity`) or needs an Attestcoin proof the app cannot build (`execute`). A narrow ABI is
 * the cheapest way to keep a screen from offering a button that always reverts.
 *
 * Addresses come from the environment with no fallback. A wrong address that fails loudly beats a
 * stale one that works quietly against the previous deployment.
 */

/**
 * Addresses are read, not asserted, at module load.
 *
 * These used to throw when the env var was missing, which sounds strict and is actually fragile:
 * the throw fires during *import*, so any module that transitively reached this file took the whole
 * page down, including a unit test that only wanted a chain id. Returning `undefined` keeps the
 * failure where it belongs — at the call site, which can disable a query and say why — while still
 * never inventing an address.
 */
const asAddress = (value: string | undefined): Address | undefined =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : undefined;

/** Creditcoin CC3. Where the limit lives and where CTC is borrowed and repaid. */
export const CREDIT_LINE = asAddress(process.env.NEXT_PUBLIC_CREDIT_LINE);

/** Ethereum Sepolia. Where the collateral is locked and stays. */
export const SOURCE_VAULT = asAddress(process.env.NEXT_PUBLIC_SOURCE_VAULT);

/** Chain ids come from the network definitions, not from the environment: they are facts about the
 *  chains, not about this deployment, so they are always available. */
export const CREDITCOIN_CHAIN_ID = creditcoinTestnet.id as number;
export const SEPOLIA_CHAIN_ID = sepolia.id as number;

/**
 * `as const` is doing real work: viem reads the literal types to infer argument and return types
 * per function, so `readContract({ functionName: "limitOf" })` is known to return `bigint`. Drop it
 * and every call degrades to `unknown`.
 */
export const creditLineAbi = [
  { type: "function", name: "draw", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "repay", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "limitOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "scoreOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isOverdue", stateMutability: "view", inputs: [{ name: "borrower", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "collateralPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "Drawn",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "outstanding", type: "uint256", indexed: false },
      { name: "dueAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Repaid",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "outstanding", type: "uint256", indexed: false },
    ],
  },
] as const;

export const sourceVaultAbi = [
  { type: "function", name: "lock", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "unlock", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "releasable", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  {
    type: "event",
    name: "CollateralLocked",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
] as const;

export const explorerTx = (chainId: number, hash: string): string =>
  chainId === SEPOLIA_CHAIN_ID
    ? `https://sepolia.etherscan.io/tx/${hash}`
    : `https://creditcoin-testnet.blockscout.com/tx/${hash}`;
