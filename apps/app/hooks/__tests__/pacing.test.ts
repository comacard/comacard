import { POLL_ACTIVE, POLL_IDLE, pollInterval } from "../../lib/comacard/polling";

/**
 * The rule every polling hook shares, pinned in one place.
 *
 * The screens read chains and an indexer, and nothing on either pushes. A deposit landing, a relay
 * delivering, an operator approving a release: each is somebody else's clock, and the only thing
 * that keeps a figure true is asking again. The bug this exists to prevent is the opposite of a
 * wrong number, it is a right number that stopped being right an hour ago.
 */

test("hurries while something is in flight and goes quiet when nothing is", () => {
  expect(pollInterval(true)).toBe(POLL_ACTIVE);
  expect(pollInterval(false)).toBe(POLL_IDLE);
});

test("the active rate is fast enough to catch the shortest crossing", () => {
  // BSC and Fuji guardians sign in under a minute, so the active rate has to divide that window
  // several times over. Anything coarser and the screen reports a landed deposit as still crossing
  // for longer than the crossing itself took.
  expect(POLL_ACTIVE).toBeLessThanOrEqual(15_000);
  expect(60_000 / POLL_ACTIVE).toBeGreaterThanOrEqual(4);
});

test("the idle rate is slower than the active one, and bounded", () => {
  // A Creditcoin call takes about four seconds and `useCreditLine` makes four of them. The idle
  // rate has to leave the RPC alone between changes, and still be short enough that a stale screen
  // is measured in seconds rather than in how long the tab has been open.
  expect(POLL_IDLE).toBeGreaterThan(POLL_ACTIVE);
  expect(POLL_IDLE).toBeLessThanOrEqual(120_000);
});
