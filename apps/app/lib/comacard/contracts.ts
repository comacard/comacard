import type { Address } from "viem";
import { arbitrumSepolia, baseSepolia, creditcoinTestnet, sepolia } from "./wagmi";

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

/**
 * Creditcoin CC3. Where collateral deposited on chains Attestcoin cannot reach is accounted for.
 *
 * Attestcoin proves Ethereum and Sepolia only. Everything else arrives by Wormhole, into a vault on
 * its own chain and a hub here, and `collateralValueOf` on the credit line already includes what
 * the hub holds. A screen that reads only `listedTokens()` therefore shows a total larger than the
 * rows it lists, which is why this address exists on the client at all.
 */
export const REMOTE_HUB = asAddress(process.env.NEXT_PUBLIC_REMOTE_COLLATERAL_HUB);

/** Chain ids come from the network definitions, not from the environment: they are facts about the
 *  chains, not about this deployment, so they are always available. */
export const CREDITCOIN_CHAIN_ID = creditcoinTestnet.id as number;
export const SEPOLIA_CHAIN_ID = sepolia.id as number;
export const BASE_SEPOLIA_CHAIN_ID = baseSepolia.id as number;
export const ARBITRUM_SEPOLIA_CHAIN_ID = arbitrumSepolia.id as number;

/**
 * Every chain a `WormholeVault` is deployed on, keyed by Wormhole's own chain id.
 *
 * Two numbering systems meet here and neither is the other: Base Sepolia is Wormhole `10004` and
 * EVM `84532`. The hub speaks the first, wagmi speaks the second, and a screen that switches the
 * wallet has to translate between them, so both live in one row.
 */
export const WORMHOLE_VAULTS: Record<
  number,
  { evmChainId: number; vault: Address; explorer: string }
> = {
  10004: {
    evmChainId: BASE_SEPOLIA_CHAIN_ID,
    vault: "0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf",
    explorer: "https://sepolia.basescan.org",
  },
  10003: {
    evmChainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    vault: "0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30",
    explorer: "https://sepolia.arbiscan.io",
  },
};

/**
 * The vault a cross-chain deposit is locked in, on the depositor's own chain.
 *
 * `lockNative` for the chain's own coin, `lockToken` for an ERC20 after an approval — the same two
 * shapes `SourceVault` has on Sepolia, so a screen can treat both paths alike.
 */
export const wormholeVaultAbi = [
  // Wormhole charges a fee to publish, and the vault takes it out of the same `msg.value` rather
  // than crediting collateral it does not hold. So `lockNative` credits `msg.value - fee`, and a
  // screen that wants to lock exactly N has to send N + fee.
  {
    type: "function",
    name: "lockNative",
    stateMutability: "payable",
    inputs: [],
    outputs: [{ type: "uint64" }],
  },
  // Payable too, for the same fee. Easy to miss: the Sepolia `lockToken` is not.
  {
    type: "function",
    name: "lockToken",
    stateMutability: "payable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "nativeBalanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenBalanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "supportedToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "WORMHOLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

/** Just `messageFee()`, which is what a lock has to cover on top of the amount. */
export const wormholeCoreAbi = [
  {
    type: "function",
    name: "messageFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

/**
 * `as const` is doing real work: viem reads the literal types to infer argument and return types
 * per function, so `readContract({ functionName: "limitOf" })` is known to return `bigint`. Drop it
 * and every call degrades to `unknown`.
 */
export const creditLineAbi = [
  {
    type: "function",
    name: "draw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "repay", stateMutability: "payable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "limitOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "availableOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "scoreOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isOverdue",
    stateMutability: "view",
    inputs: [{ name: "borrower", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "collateralPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },

  // ---- multi-asset collateral ----
  // `collateralValueOf` is the sum the limit is actually derived from: native collateral plus every
  // listed token, each scaled by its own decimals and priced in the credit asset. Reading it beats
  // re-adding the parts in TypeScript, where a decimals mistake would quietly misprice a 6-decimal
  // stablecoin by a factor of a trillion.
  {
    type: "function",
    name: "collateralValueOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "listedTokens",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address[]" }],
  },
  {
    // The only way to read native collateral that has actually been proved on Creditcoin:
    // `CreditAccount.collateral` is internal, and this view is what exposes it.
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "collateral", type: "uint256" },
          { name: "drawn", type: "uint256" },
          { name: "pendingRelease", type: "uint256" },
          { name: "drawnAt", type: "uint64" },
          { name: "dueAt", type: "uint64" },
          { name: "provenNonce", type: "uint64" },
          { name: "cycleCount", type: "uint64" },
          { name: "repayCount", type: "uint64" },
          { name: "defaultCount", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "tokenConfig",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      // Credit-asset wei per ONE WHOLE token, 18dp. Not per base unit.
      { name: "price", type: "uint256" },
      { name: "decimals", type: "uint8" },
      { name: "listed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "tokenCollateral",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
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
  {
    type: "function",
    name: "unlock",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "releasable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },

  // ---- ERC20 collateral. Additive: the native calls above are unchanged. ----
  // `lockToken` needs an ERC20 approval first, and it credits what ACTUALLY arrived rather than the
  // amount asked for, so a fee-on-transfer token cannot over-credit itself.
  {
    type: "function",
    name: "lockToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "unlockToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "supportedToken",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "tokenBalanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenReleasable",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "TokenLocked",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
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

/**
 * The cross-chain collateral hub, read-only.
 *
 * Assets are keyed by `keccak256(chainId, token)` rather than by address, because USDC on Base and
 * USDC on Arbitrum are different assets that share a name. The `AssetListed` event is what turns
 * one of those ids back into a chain and a token: listing is a governance call, so the log is the
 * only record that cannot go stale, and reading it beats hardcoding a table that has to be edited
 * every time a chain is added.
 */
export const remoteHubAbi = [
  {
    type: "function",
    name: "listedAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32[]" }],
  },
  {
    type: "function",
    name: "remoteAsset",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "bytes32" }],
    outputs: [
      // Credit-asset wei per ONE WHOLE unit, 18dp. Not per base unit.
      { name: "price", type: "uint256" },
      { name: "decimals", type: "uint8" },
      { name: "listed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "collateralOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "assetId", type: "bytes32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "valueOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "AssetListed",
    inputs: [
      { name: "assetId", type: "bytes32", indexed: true },
      { name: "chainId", type: "uint16", indexed: true },
      { name: "token", type: "bytes32", indexed: false },
      { name: "decimals", type: "uint8", indexed: false },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
] as const;

/**
 * Wormhole's own chain ids, which are not EVM chain ids and not Attestcoin chain keys.
 *
 * Three numbering systems now meet in this app and none of them agree: Base Sepolia is Wormhole
 * 10004 and EVM 84532, while Attestcoin's key 1 means Sepolia. Naming them here keeps the confusion
 * in one place.
 */
export const WORMHOLE_CHAIN_NAMES: Record<number, string> = {
  10002: "Sepolia",
  10003: "Arbitrum Sepolia",
  10004: "Base Sepolia",
  10005: "Optimism Sepolia",
  10006: "Avalanche Fuji",
};

/** Just enough ERC20 to read a token and approve a lock. */
export const erc20Abi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/**
 * `TestToken.faucet`, the mint anybody may call on the Sepolia collateral tokens.
 *
 * It exists so the multi-asset path can be exercised without sourcing real USDC, and it is the
 * reason a zero balance on this screen is not a dead end. The argument is in WHOLE tokens, not base
 * units: `faucet(1000)` on 6-decimal tUSDC mints 1000e6. Capped at `FAUCET_LIMIT` (100,000) per
 * call, and the call reverts above it rather than clamping.
 *
 * This is only ever safe because these tokens are worthless by construction. Nothing real is ever
 * mintable this way.
 */
export const testTokenAbi = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [{ name: "wholeTokens", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "FAUCET_LIMIT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
