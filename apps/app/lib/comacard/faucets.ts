import { NATIVE_SYMBOL, WORMHOLE_CHAIN_NAMES, WORMHOLE_VAULTS } from "./contracts";

/**
 * Where to get gas, per chain.
 *
 * Every chain this app can lock on needs its own coin before anything else can happen, and the
 * Account screen listed one of the six. Somebody demoing a BSC deposit had to go and find a tBNB
 * faucet themselves, which is the sort of thing that gets discovered while recording.
 *
 * **Keyed by Wormhole chain id, deliberately.** That is the id `WORMHOLE_VAULTS`,
 * `WORMHOLE_CHAIN_NAMES` and `NATIVE_SYMBOL` are already keyed by, so a chain cannot appear here
 * under a number the rest of the app disagrees with. Three numbering systems is already two too
 * many, and the root CLAUDE.md lists five separate bugs from lists of chains that drifted apart.
 * `faucets.test.ts` asserts this table and the vault table name the same chains.
 *
 * Sepolia is `10002` here even though its deposits travel by Attestcoin rather than Wormhole. It
 * has a Wormhole id like any chain, nothing reads this table to decide a carrier, and giving it a
 * sixth identifier to be the odd one out would be the exact mistake the paragraph above describes.
 *
 * Every URL was checked to resolve on 13 September 2026. They are third-party pages and can move;
 * a dead faucet link is a dead end in a demo, so re-check them before a recording rather than
 * assuming.
 */
export type Faucet = {
  /** Wormhole chain id. See the note above on why this and not an EVM id. */
  wormholeChainId: number;
  /** Chain as a person reads it, from the one table that already names them. */
  chainName: string;
  /** The coin the faucet hands out. */
  symbol: string;
  href: string;
  /** Who runs it, shown so nobody wonders whose site they just opened. */
  host: string;
};

export const FAUCETS: Faucet[] = [
  {
    wormholeChainId: 10002,
    chainName: WORMHOLE_CHAIN_NAMES[10002],
    symbol: NATIVE_SYMBOL[10002],
    href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
    host: "Google Cloud",
  },
  {
    wormholeChainId: 4,
    chainName: WORMHOLE_CHAIN_NAMES[4],
    symbol: NATIVE_SYMBOL[4],
    href: "https://www.bnbchain.org/en/testnet-faucet",
    host: "BNB Chain",
  },
  {
    wormholeChainId: 6,
    chainName: WORMHOLE_CHAIN_NAMES[6],
    symbol: NATIVE_SYMBOL[6],
    href: "https://core.app/tools/testnet-faucet",
    host: "Core",
  },
  {
    wormholeChainId: 10004,
    chainName: WORMHOLE_CHAIN_NAMES[10004],
    symbol: NATIVE_SYMBOL[10004],
    href: "https://cloud.google.com/application/web3/faucet/base/sepolia",
    host: "Google Cloud",
  },
  {
    wormholeChainId: 10003,
    chainName: WORMHOLE_CHAIN_NAMES[10003],
    symbol: NATIVE_SYMBOL[10003],
    href: "https://cloud.google.com/application/web3/faucet/arbitrum/sepolia",
    host: "Google Cloud",
  },
  {
    wormholeChainId: 10005,
    chainName: WORMHOLE_CHAIN_NAMES[10005],
    symbol: NATIVE_SYMBOL[10005],
    href: "https://cloud.google.com/application/web3/faucet/optimism/sepolia",
    host: "Google Cloud",
  },
];

/**
 * Sepolia first, then the chains in the order the demo actually uses them.
 *
 * BSC and Fuji lead the rest because they are L1s whose guardians sign in under a minute. The three
 * L2s publish at finalized consistency and take fifteen to twenty, so a demo that reaches for one
 * of them by accident spends that long looking at a spinner. See DEMO.md.
 */
export const FAUCET_CHAINS: number[] = FAUCETS.map((f) => f.wormholeChainId);

/** The chains a deposit can actually be made from: everything with a vault, plus Attestcoin's. */
export const DEPOSIT_CHAINS: number[] = [
  10002,
  ...Object.keys(WORMHOLE_VAULTS)
    .map(Number)
    .sort((a, b) => FAUCET_CHAINS.indexOf(a) - FAUCET_CHAINS.indexOf(b)),
];
