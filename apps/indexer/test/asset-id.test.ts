import { expect, test } from "bun:test";
import { encodePacked, keccak256, pad } from "viem";

/**
 * The asset id is computed in two places — CollateralMessage.assetId in Solidity
 * and the Wormhole handler here — because the vault's Locked event carries only
 * a token address while the hub's event carries the derived id. If the two ever
 * disagree, a deposit's lock and its credit land on different rows and the app
 * shows a balance that never arrives.
 *
 * The expected values are read off the live hub, which listed them itself:
 * cast call 0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f "listedAssets()(bytes32[])"
 */
function assetId(wormholeChainId: number, token: string): string {
  return keccak256(
    encodePacked(
      ["uint16", "bytes32"],
      [wormholeChainId, pad(token as `0x${string}`, { size: 32 })],
    ),
  );
}

const ZERO = "0x0000000000000000000000000000000000000000";

test.each([
  [
    "Base Sepolia native",
    10_004,
    ZERO,
    "0xc6aa4e4fb533fd7554116f7dca41109d6a4dddfbe397eefc56f10843fdc544bb",
  ],
  [
    "Arbitrum Sepolia native",
    10_003,
    ZERO,
    "0x68ec44ebd2f675a61ae83495f96d229c53ef4eb6f8d8bf0f5e8c1ce09249e71a",
  ],
  [
    "Base Sepolia USDC",
    10_004,
    "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "0x64708db2d3b6c4d9be390d052f68128612659543e34c302a0963193a09ab9634",
  ],
  [
    "Arbitrum Sepolia USDC",
    10_003,
    "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
    "0x318a24739129add73aec5a931ba23ca42acf2412bea7b918146866c544c70d80",
  ],
])("%s matches the id the contract emitted", (_name, chainId, token, expected) => {
  expect(assetId(chainId as number, token as string)).toBe(expected as string);
});

test("the same token on two chains is two assets", () => {
  const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  expect(assetId(10_004, usdc)).not.toBe(assetId(10_003, usdc));
});
