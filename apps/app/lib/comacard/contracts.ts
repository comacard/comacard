import { type Address, encodePacked, type Hex, keccak256 } from "viem";
import {
  arbitrumSepolia,
  avalancheFuji,
  baseSepolia,
  bscTestnet,
  creditcoinTestnet,
  optimismSepolia,
  sepolia,
} from "./wagmi";

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
 * failure where it belongs (at the call site, which can disable a query and say why) while still
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
export const OPTIMISM_SEPOLIA_CHAIN_ID = optimismSepolia.id as number;
export const BSC_TESTNET_CHAIN_ID = bscTestnet.id as number;
export const AVALANCHE_FUJI_CHAIN_ID = avalancheFuji.id as number;

/**
 * Every chain a `WormholeVault` is deployed on, keyed by Wormhole's own chain id.
 *
 * Two numbering systems meet here and neither is the other: Base Sepolia is Wormhole `10004` and
 * EVM `84532`. The hub speaks the first, wagmi speaks the second, and a screen that switches the
 * wallet has to translate between them, so both live in one row.
 */
/**
 * Where a deposit is locked on each chain, and who relays a release back to it.
 *
 * `relay` is the `ReleaseRelay` that holds `OPERATOR_ROLE` on that chain's vault. It is here rather
 * than in a table of its own because a sixth list of chains is how this project has produced bugs
 * before: `chains.test.ts` asserts every entry has both, and every one of these was verified against
 * `vault.operator()` on its own chain on 13 September 2026.
 *
 * `ReleaseRelay.executeRelease` takes no access modifier, so this address is something the holder
 * calls, not something only the worker calls. See `lib/comacard/vaa.ts`.
 */
export const WORMHOLE_VAULTS: Record<
  number,
  { evmChainId: number; vault: Address; explorer: string; relay: Address }
> = {
  10004: {
    evmChainId: BASE_SEPOLIA_CHAIN_ID,
    vault: "0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf",
    explorer: "https://sepolia.basescan.org",
    relay: "0x4ab591d70462c69792E35d7C61f118BEFd45e62e",
  },
  10003: {
    evmChainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    vault: "0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30",
    explorer: "https://sepolia.arbiscan.io",
    relay: "0xFcb45153DbA2fAd0864E1e24293C33AB99b507eB",
  },
  10005: {
    evmChainId: OPTIMISM_SEPOLIA_CHAIN_ID,
    vault: "0xCaBFa324576c655D0276647A7f0aF5e779123e0B",
    explorer: "https://sepolia-optimism.etherscan.io",
    relay: "0xE3965709c657748501bB33a55AEFdE7F9622FD5E",
  },
  4: {
    evmChainId: BSC_TESTNET_CHAIN_ID,
    vault: "0x9d8B6852705dD7585B3907244d603547a4eA32d6",
    explorer: "https://testnet.bscscan.com",
    relay: "0x740B0c07c3291FECF5e852F86652Ffbb575A2378",
  },
  6: {
    evmChainId: AVALANCHE_FUJI_CHAIN_ID,
    vault: "0x7D68B54a6eDd92F9e6f17E75dbE4d9838cD88a1b",
    explorer: "https://testnet.snowtrace.io",
    relay: "0xDE88C384AC8347F8C8B78C7DDE40432B95F629E1",
  },
};

/**
 * The vault a cross-chain deposit is locked in, on the depositor's own chain.
 *
 * `lockNative` for the chain's own coin, `lockToken` for an ERC20 after an approval, the same two
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
    name: "nativeReleasable",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
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
    type: "function",
    name: "unlockNative",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
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

/**
 * A transaction link, for any chain this product touches.
 *
 * It used to know Sepolia and fall through to Creditcoin for everything else, which was true while
 * there were two chains and became a wrong link the moment there were six: a BSC lock pointed at
 * Creditcoin's explorer, where it does not exist. The far-chain bases come from `WORMHOLE_VAULTS`
 * rather than a second table, because that one is already the list of chains with a vault on them.
 */
const EXPLORER: Record<number, string> = {
  [SEPOLIA_CHAIN_ID]: "https://sepolia.etherscan.io",
  [CREDITCOIN_CHAIN_ID]: "https://creditcoin-testnet.blockscout.com",
  ...Object.fromEntries(
    Object.values(WORMHOLE_VAULTS).map((v) => [v.evmChainId, v.explorer] as const),
  ),
};

export const explorerTx = (chainId: number, hash: string): string =>
  `${EXPLORER[chainId] ?? "https://creditcoin-testnet.blockscout.com"}/tx/${hash}`;

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
    // Payable for Wormhole's message fee, which the hub forwards. Zero on these testnets today,
    // which is exactly why it is read from the core contract rather than assumed.
    type: "function",
    name: "requestRelease",
    stateMutability: "payable",
    inputs: [
      { name: "chainId", type: "uint16" },
      { name: "token", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "uint64" }],
  },
  {
    type: "function",
    name: "wormhole",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
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
  // BSC Testnet and Avalanche Fuji predate Wormhole's 10000-block testnet ids and reuse their
  // mainnet numbers. This file had Fuji at 10006, extrapolated from the sequence above it, 10006
  // is Holesky. These five now match `apps/worker/src/config.ts` and the indexer's chain map.
  4: "BSC Testnet",
  6: "Avalanche Fuji",
  10002: "Sepolia",
  10003: "Arbitrum Sepolia",
  10004: "Base Sepolia",
  10005: "Optimism Sepolia",
};

/**
 * What the chain's own coin is called, and how long its messages take.
 *
 * Both were hardcoded and both were wrong on two of the five chains. The deposit screen read
 * `native ? "ETH" : "USDC"`, so locking BNB said "Lock ETH … 0.072136 ETH on BSC Testnet", wrong
 * about the asset a person is being asked to part with, on the screen where they part with it. And
 * every screen promised "about fifteen minutes", which is true for the three L2s and wrong by a
 * factor of thirty for the two L1s.
 *
 * The split is not arbitrary. Base, Arbitrum and Optimism publish at finalized consistency and
 * finalize against Ethereum, so the guardians wait on Ethereum; BSC and Fuji finalize themselves.
 * @FjrREPO measured 1173s and 1290s on the L2s against 189s and 202s on the L1s, and said the two
 * L1 figures are upper bounds that include him running the relay by hand.
 */
export const NATIVE_SYMBOL: Record<number, string> = {
  4: "BNB",
  6: "AVAX",
  10002: "ETH",
  10003: "ETH",
  10004: "ETH",
  10005: "ETH",
};

/** True for the chains that finalize on their own rather than against Ethereum. */
export const SIGNS_FAST: Record<number, boolean> = { 4: true, 6: true };

/** How long to tell someone a message takes, for the chain it is crossing from. */
export const crossingTime = (wormholeChainId: number): string =>
  SIGNS_FAST[wormholeChainId] ? "under a minute" : "about fifteen minutes";

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

/** A token of all zeroes is how the hub spells "this chain's own coin". */
export const ZERO_TOKEN = `0x${"0".repeat(64)}` as Hex;

/**
 * The id the hub files an asset under, derived rather than looked up.
 *
 * `CollateralMessage.assetId` is `keccak256(abi.encodePacked(chainId, token))`, so the id is a pure
 * function of the chain and the token. For the chain's own coin the token is 32 zero bytes, which
 * means all five native assets can be computed here with no network call at all.
 *
 * That matters because the alternative is expensive. The origin of a listing is otherwise recovered
 * from `AssetListed` logs, and `eth_getLogs` on the Creditcoin RPC costs three to six seconds per
 * 5,000-block window, walked backwards one window at a time. Measured on 13 September 2026: two
 * windows, 5.77s then 3.11s, before a single balance had been read. BNB simply was not on Home for
 * the first nine seconds.
 *
 * **`encodePacked`, not `encode`.** With `abi.encode` the uint16 is left-padded to a full word and
 * every id comes out different; the ids then match nothing on chain and every asset looks unlisted.
 * `contracts.test.ts` pins all five against ids read off the live hub.
 */
export function nativeAssetId(wormholeChainId: number): Hex {
  return keccak256(encodePacked(["uint16", "bytes32"], [wormholeChainId, ZERO_TOKEN]));
}

/**
 * `executeRelease` only, which is the whole of what a holder needs from a relay.
 *
 * **No access modifier on it, deliberately.** The relay verifies that the message was emitted by
 * our hub on Creditcoin and refuses anything else, and `consumedVaa` stops the same signature being
 * used twice. So the safety is in the payload rather than in the sender, and the holder submitting
 * their own release is exactly as safe as the worker doing it. Whichever arrives first wins; the
 * loser reverts with `AlreadyConsumed`.
 */
export const releaseRelayAbi = [
  {
    type: "function",
    name: "executeRelease",
    stateMutability: "nonpayable",
    inputs: [{ name: "vaa", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "HUB_CHAIN_ID",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
] as const;

/**
 * The chain the Attestcoin carrier proves from, as a screen names it.
 *
 * One definition because two screens show it: the collateral list and the claimable list. Two
 * string literals is two chances for one of them to say something else.
 */
export const ATTESTCOIN_NETWORK = "Ethereum Sepolia";
