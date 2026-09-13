import type { CreditEvent } from "../../../hooks/useCreditHistory";
import { MIN_CYCLE_SECONDS, scoredCount, toCycles } from "../cycles";

/**
 * The cycle is the unit the whole product is priced in, and it was not on any screen.
 *
 * A cycle opens on a draw and closes on the repayment that clears the balance. Only a closed cycle
 * raises the score, and only the score makes the same collateral buy a bigger limit. The trap the
 * contract sets is that a cycle closed inside `minCycleDuration` settles the debt and scores
 * nothing, with no error and nothing on chain to distinguish it from one that scored.
 */

const ONE = 10n ** 18n;
const T = 1_700_000_000;

const draw = (id: string, at: number, amount: bigint): CreditEvent => ({
  id,
  kind: "borrow",
  amount,
  at,
  txHash: `0x${id}`,
  settled: false,
});

const repay = (id: string, at: number, amount: bigint, settled: boolean): CreditEvent => ({
  id,
  kind: "repay",
  amount,
  at,
  txHash: `0x${id}`,
  settled,
});

test("a draw and the repayment that clears it are one cycle", () => {
  const cycles = toCycles([draw("d1", T, ONE), repay("r1", T + 600, ONE, true)]);

  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.borrowed).toBe(ONE);
  expect(cycles[0]?.repaid).toBe(ONE);
  expect(cycles[0]?.closedAt).toBe(T + 600);
  expect(cycles[0]?.scored).toBe(true);
});

test("a cycle closed inside a minute settles the debt and scores nothing", () => {
  // The trap: `minCycleDuration` is 60 seconds on the deployed contract, not the 1-day default.
  // The repayment looks identical on chain to one that scored, so this is the one row on the
  // screen that would otherwise be a lie by omission.
  const cycles = toCycles([draw("d1", T, ONE), repay("r1", T + MIN_CYCLE_SECONDS - 1, ONE, true)]);

  expect(cycles[0]?.closedAt).not.toBeNull();
  expect(cycles[0]?.tooFast).toBe(true);
  expect(cycles[0]?.scored).toBe(false);
});

test("exactly a minute counts", () => {
  // The contract's check is `held >= minCycleDuration`, so the boundary scores.
  const cycles = toCycles([draw("d1", T, ONE), repay("r1", T + MIN_CYCLE_SECONDS, ONE, true)]);
  expect(cycles[0]?.scored).toBe(true);
});

test("a second draw grows the open cycle rather than starting another", () => {
  // The contract measures one balance per account, and times from the first draw. Treating the
  // second draw as a new cycle would double the count and reset the clock, which is exactly
  // backwards: the clock belongs to the cycle that is already open.
  const cycles = toCycles([
    draw("d1", T, ONE),
    draw("d2", T + 30, 2n * ONE),
    repay("r1", T + 600, 3n * ONE, true),
  ]);

  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.openedAt).toBe(T);
  expect(cycles[0]?.borrowed).toBe(3n * ONE);
});

test("a partial repayment does not close anything", () => {
  // Only a repayment that clears the balance to zero closes a cycle. A partial one reduces the
  // debt and earns no mark.
  const cycles = toCycles([draw("d1", T, 2n * ONE), repay("r1", T + 600, ONE, false)]);

  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.closedAt).toBeNull();
  expect(cycles[0]?.repaid).toBe(ONE);
  expect(cycles[0]?.scored).toBe(false);
});

test("an open cycle is reported as open, not as closed at zero", () => {
  const cycles = toCycles([draw("d1", T, ONE)]);

  expect(cycles[0]?.closedAt).toBeNull();
  expect(cycles[0]?.closeTxHash).toBeNull();
  expect(cycles[0]?.tooFast).toBe(false);
});

test("newest first, because a history screen is read from the top", () => {
  const cycles = toCycles([
    draw("d1", T, ONE),
    repay("r1", T + 600, ONE, true),
    draw("d2", T + 5000, 2n * ONE),
    repay("r2", T + 6000, 2n * ONE, true),
  ]);

  expect(cycles.map((c) => c.id)).toEqual(["d2", "d1"]);
});

test("events out of order are sorted before folding", () => {
  // The hook sorts, but a caller that passed raw rows would otherwise get a repayment attributed
  // to a cycle that had not opened yet.
  const cycles = toCycles([repay("r1", T + 600, ONE, true), draw("d1", T, ONE)]);

  expect(cycles).toHaveLength(1);
  expect(cycles[0]?.scored).toBe(true);
});

test("a repayment with no opening draw in the window is dropped, not invented", () => {
  // The query takes the last 100 events; an old cycle can have its draw outside that window.
  // Fabricating a cycle to hold the repayment would put a row on screen with a zero borrow.
  const cycles = toCycles([repay("r1", T, ONE, true)]);
  expect(cycles).toEqual([]);
});

test("scoredCount counts only what moved the score", () => {
  const cycles = toCycles([
    draw("d1", T, ONE),
    repay("r1", T + 600, ONE, true), // scored
    draw("d2", T + 1000, ONE),
    repay("r2", T + 1010, ONE, true), // ten seconds: too fast
    draw("d3", T + 2000, ONE), // still open
  ]);

  expect(cycles).toHaveLength(3);
  expect(scoredCount(cycles)).toBe(1);
});
