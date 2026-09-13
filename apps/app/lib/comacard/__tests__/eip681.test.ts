import { lockNativeUri, lockTokenUri } from "../eip681";

const VAULT = "0x9d8B6852705dD7585B3907244d603547a4eA32d6" as const;
const TOKEN = "0x0000000000000000000000000000000000000abc" as const;

/**
 * A wrong character here is a wrong transaction, and the person finds out by signing it.
 *
 * These assert the exact string rather than parsing it back, because a round trip through a parser
 * this file also wrote would agree with itself about any mistake both halves share.
 */

test("a native lock names the function, the chain and the value", () => {
  expect(lockNativeUri(VAULT, 97, 10n ** 16n)).toBe(
    `ethereum:${VAULT}@97/lockNative?value=10000000000000000`,
  );
});

test("the value is full decimal, never scientific shorthand", () => {
  // EIP-681 permits `1e16`, and wallets have mis-read it. There is nothing to gain from the
  // shorthand inside a QR code, where nobody is reading the string anyway.
  const uri = lockNativeUri(VAULT, 97, 10n ** 18n);
  expect(uri).toContain("value=1000000000000000000");
  expect(uri).not.toMatch(/e\d/);
});

test("a big amount survives, because it never becomes a number", () => {
  // 1000 ETH in wei is past Number.MAX_SAFE_INTEGER. Every amount on the wire in this project is a
  // decimal string for exactly this reason.
  const wei = 1000n * 10n ** 18n;
  expect(lockNativeUri(VAULT, 97, wei)).toContain(`value=${wei.toString(10)}`);
  expect(lockNativeUri(VAULT, 97, wei)).toContain("value=1000000000000000000000");
});

test("a token lock keeps the amount and the fee apart", () => {
  // `amount` is the token's own base units and is a function argument; `value` is native wei and
  // carries only the Wormhole message fee. Putting the token amount in `value` would ask the wallet
  // to send that many wei of the chain's own coin.
  const uri = lockTokenUri(VAULT, 97, TOKEN, 1_000_000n, 5n * 10n ** 14n);

  expect(uri).toBe(
    `ethereum:${VAULT}@97/lockToken?token=${TOKEN}&amount=1000000&value=500000000000000`,
  );
});

test("a token lock with no message fee still sends a zero value, not a missing one", () => {
  // Wormhole's testnet message fee is currently zero. Omitting the parameter would leave the value
  // undefined rather than zero, which wallets have defaulted in both directions.
  expect(lockTokenUri(VAULT, 97, TOKEN, 1n, 0n)).toContain("value=0");
});

test("refuses to build a code for a transaction that can only revert", () => {
  // `lockNative` reverts with FeeNotCovered below the fee and `lockToken` with NothingToLock at
  // zero. A QR for either is a code whose only outcome is a failed signature.
  expect(() => lockNativeUri(VAULT, 97, 0n)).toThrow(/greater than zero/);
  expect(() => lockTokenUri(VAULT, 97, TOKEN, 0n, 0n)).toThrow(/greater than zero/);
  expect(() => lockNativeUri(VAULT, 97, -1n)).toThrow(/greater than zero/);
});

test("the chain id is the EVM one, which is what a wallet switches to", () => {
  // BSC is Wormhole 4 and EVM 97; Fuji is Wormhole 6 and EVM 43113. A URI carrying the Wormhole id
  // would name chain 4 (Customer-specific) or chain 6 (Kotti), and the wallet would either refuse
  // or offer to sign on a chain nobody meant.
  expect(lockNativeUri(VAULT, 97, 1n)).toContain("@97/");
  expect(lockNativeUri(VAULT, 43113, 1n)).toContain("@43113/");
});
