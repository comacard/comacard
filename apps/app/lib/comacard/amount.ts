import { formatUnits } from "viem";

/**
 * What the 10% / 50% / Max buttons put into the keypad.
 *
 * **The bug this exists to fix.** Every one of those buttons did
 * `formatUnits(total * pct / 100n, decimals)` and handed the result straight to the keypad. At 18
 * decimals half of 34.3333 tCTC is `17.166666666666666666`, which is twenty characters: it ran off
 * the side of a 60px display, and clearing it took twenty presses of backspace because each one
 * removes a single character. Somebody who tapped 50% by accident had no way back to where they
 * were.
 *
 * So a quick amount is rounded to what a person could plausibly have typed. Six decimals is the
 * ceiling, less when the token carries less.
 *
 * **Always down, never up.** The figure lands in a field whose maximum is the same balance it came
 * from, so rounding up by one unit in the last place would produce an amount the transaction
 * rejects, from a button whose whole purpose is to be safe to press. Truncating instead leaves at
 * most a speck behind, which no screen here cares about.
 *
 * Max is the exception and it is handled by the caller, not here: on Repay the last speck is the
 * difference between closing a cycle and not, so `PayScreen` tracks that Max was pressed and sends
 * the exact figure it read from the chain rather than anything this function returned.
 */

/** Decimal places a person would type. Six is a tenth of a millionth, which is past any keypad. */
const MAX_TYPED_DECIMALS = 6;

export function quickAmount(total: bigint, pct: number, decimals: number): string {
  if (total <= 0n) return "0";

  // Basis points rather than floats: `total * 0.1` on a bigint is a type error, and going through
  // Number to do it loses precision above ~9e15, which every wei figure here is.
  const part = (total * BigInt(Math.round(pct * 10_000))) / 10_000n;
  return trimTo(part, decimals, Math.min(decimals, MAX_TYPED_DECIMALS));
}

/**
 * A base-unit figure as a decimal string with at most `places` after the point, rounded down.
 *
 * Done on the string rather than by dividing the bigint, because the trailing-zero trimming below
 * has to see the digits anyway and a second bigint division is one more place to be off by one.
 */
export function trimTo(value: bigint, decimals: number, places: number): string {
  const full = formatUnits(value, decimals);
  const [whole, fraction = ""] = full.split(".");
  if (places <= 0) return whole as string;

  const kept = fraction.slice(0, places).replace(/0+$/, "");
  return kept === "" ? (whole as string) : `${whole}.${kept}`;
}
