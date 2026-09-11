import { createPublicClient, http, type PublicClient } from "viem";

/**
 * What ETH and CTC are worth, read from contracts rather than from a price API.
 *
 * Creditcoin has no price feed of its own: `eth_getCode` is empty at the standard Pyth, API3 and
 * RedStone addresses on CC3. So both legs are read from Ethereum, where the market actually is.
 *
 *   ETH/USD   Chainlink's aggregator on Sepolia. A real decentralised feed, updated continuously.
 *   ETH/CTC   The Uniswap V2 CTC/WETH pool's reserve ratio on Ethereum mainnet. CTC has no
 *             Chainlink feed anywhere, and this pool is the only on-chain market for it.
 *
 * CTC/USD then falls out of the two, with no third source needed.
 *
 * **This is a spot read of a thin pool.** About 1.8 WETH sits in that pair, which is cheap to move.
 * It tracks the centralised price closely today (within ~1.2% when last checked) and it is the
 * honest way to show a live number in a testnet demo, but it is not collateral-grade pricing and
 * should not be described as such.
 *
 * Both reads are also *provable*: each is an event in a transaction Attestcoin can verify on
 * Creditcoin, which is how `ASCCreditLine.setCollateralPrice` could stop being operator-fed. That
 * is a contract change, not a frontend one; this file just reads the same sources directly.
 */

/** Chainlink ETH/USD aggregator proxy on Sepolia. Answers carry 8 decimals. */
const CHAINLINK_ETH_USD = "0x694AA1769357215DE4FAC081bf1f309aDC325306" as const;

/** Uniswap V2 CTC/WETH pair on Ethereum mainnet. token0 is CTC, token1 is WETH. */
const UNISWAP_CTC_WETH = "0x93f6a87eb364bf59b95a1f523a2c23e33c0eebda" as const;

const aggregatorAbi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

const pairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
] as const;

const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const MAINNET_RPC =
  process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL ?? "https://ethereum-rpc.publicnode.com";

export type Prices = {
  /** USD per ETH. */
  ethUsd: number;
  /** CTC per one ETH, from the pool's reserve ratio. */
  ctcPerEth: number;
  /** USD per CTC, derived from the two above. */
  ctcUsd: number;
  /** When Chainlink last published, unix seconds. Lets a screen say how fresh the number is. */
  ethUsdUpdatedAt: number;
};

let sepoliaClient: PublicClient | null = null;
let mainnetClient: PublicClient | null = null;

const sepolia = () =>
  (sepoliaClient ??= createPublicClient({ transport: http(SEPOLIA_RPC) }) as PublicClient);
const mainnet = () =>
  (mainnetClient ??= createPublicClient({ transport: http(MAINNET_RPC) }) as PublicClient);

export async function readPrices(): Promise<Prices> {
  const [round, reserves] = await Promise.all([
    sepolia().readContract({
      address: CHAINLINK_ETH_USD,
      abi: aggregatorAbi,
      functionName: "latestRoundData",
    }),
    mainnet().readContract({
      address: UNISWAP_CTC_WETH,
      abi: pairAbi,
      functionName: "getReserves",
    }),
  ]);

  // Chainlink answers are int256 with 8 decimals. Dividing at this size is safe: ETH/USD is far
  // below the 2^53 boundary once scaled down, unlike the wei amounts elsewhere in this app.
  const ethUsd = Number(round[1]) / 1e8;
  const ethUsdUpdatedAt = Number(round[3]);

  // Both sides are 18-decimal, so the ratio needs no scaling. Guard the divide: an empty pool would
  // otherwise produce Infinity and render as a plausible-looking price.
  const ctcReserve = reserves[0];
  const wethReserve = reserves[1];
  const ctcPerEth = wethReserve === 0n ? 0 : Number(ctcReserve) / Number(wethReserve);
  const ctcUsd = ctcPerEth === 0 ? 0 : ethUsd / ctcPerEth;

  return { ethUsd, ctcPerEth, ctcUsd, ethUsdUpdatedAt };
}
