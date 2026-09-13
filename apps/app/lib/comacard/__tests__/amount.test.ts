import { quickAmount, trimTo } from "../amount";

/**
 * The shipped bug: 50% of 34.3333 tCTC at 18 decimals is `17.166666666666666666`.
 *
 * Twenty characters, in a 60px display, cleared one character per press of backspace. Somebody who
 * tapped 50% by mistake had no way back.
 */

const ONE = 10n ** 18n;

test("a quick amount is short enough to have been typed", () => {
  // The balance from the screenshot. The headline rounds it to 34.3333, but the wei figure behind
  // that is 34.333333333333333333, and half of it recurs: 17.166666666666666666, twenty characters.
  const available = 34_333_333_333_333_333_333n;
  const half = quickAmount(available, 0.5, 18);

  expect(half).toBe("17.166666");
  expect(half.length).toBeLessThanOrEqual(12);
});

test("half of a figure that divides cleanly keeps its own digits", () => {
  expect(quickAmount((343_333n * ONE) / 10_000n, 0.5, 18)).toBe("17.16665");
});

test("rounds down, because the field's maximum is the balance it came from", () => {
  // Rounding up by one in the last place produces an amount the transaction rejects, from a button
  // whose whole purpose is to be safe to press.
  const max = quickAmount((343_333n * ONE) / 10_000n, 1, 18);

  expect(max).toBe("34.3333");
  expect(Number(max)).toBeLessThanOrEqual(34.3333);
});

test("keeps a token's own precision when it has less than six places", () => {
  // 6dp tUSDC. Padding to six is right here; asking for more would be inventing digits.
  expect(quickAmount(1_000_000n, 0.5, 6)).toBe("0.5");
  expect(quickAmount(1n, 1, 6)).toBe("0.000001");
});

test("trailing zeroes are trimmed, so 50% of a round number stays round", () => {
  expect(quickAmount(2n * ONE, 0.5, 18)).toBe("1");
  expect(quickAmount(ONE, 0.1, 18)).toBe("0.1");
});

test("a balance too small to show at six places is zero, not a rounding artefact", () => {
  // One wei. Anything other than "0" here would put a figure in the field that reads as money.
  expect(quickAmount(1n, 0.5, 18)).toBe("0");
  expect(quickAmount(0n, 1, 18)).toBe("0");
});

test("survives a figure past what a JS number can hold", () => {
  // 1000 ETH in wei is past Number.MAX_SAFE_INTEGER, and every amount here is wei.
  expect(quickAmount(1000n * ONE, 0.5, 18)).toBe("500");
});

test("trimTo cuts rather than rounds", () => {
  // 0.999999999 to two places is 0.99, not 1.00. Rounding up would exceed the source balance.
  expect(trimTo(999_999_999_999_999_999n, 18, 2)).toBe("0.99");
  expect(trimTo(999_999_999_999_999_999n, 18, 0)).toBe("0");
});
