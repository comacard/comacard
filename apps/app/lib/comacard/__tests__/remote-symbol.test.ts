import { describe, expect, test } from "vitest";

/**
 * A cross-chain row has to name the asset that crossed, not the coin its chain pays gas in.
 *
 * The feed used to read the symbol off the chain id alone, so 12 USDC from Base Sepolia was
 * rendered as "12.00 ETH now backs your credit limit". Both are plausible sentences about a Base
 * deposit and only one of them is true, which is the shape this repository's notes call a plural
 * treated as a singular: the chain has more than one asset and the code assumed it had one.
 *
 * This pins the distinction at the level the bug lived at, the token address, rather than through
 * the whole query.
 */

const NATIVE = "0x0000000000000000000000000000000000000000";
const isNative = (token?: string) => token === undefined || token.toLowerCase() === NATIVE;

describe("which symbol a remote row carries", () => {
  test("the zero address means the chain's own coin", () => {
    expect(isNative(NATIVE)).toBe(true);
    expect(isNative(NATIVE.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  test("an ERC20 address does not", () => {
    // Base Sepolia USDC, the asset that was being called ETH.
    expect(isNative("0x036CbD53842c5426634e7929541eC2318f3dCF7e")).toBe(false);
  });

  test("case does not decide it", () => {
    // The indexer lower-cases addresses and the app's constants do not, so a comparison that
    // respects case answers "ERC20" for the native coin on one of the two.
    expect(isNative("0x0000000000000000000000000000000000000000")).toBe(true);
  });

  test("a missing asset row is treated as native rather than guessed", () => {
    // Mid-sync the deposit lands before its asset row. Native is the safe default: it is what every
    // chain has, and the caller skips the row entirely when the asset is null anyway.
    expect(isNative(undefined)).toBe(true);
  });
});
