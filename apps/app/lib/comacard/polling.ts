/**
 * How often a screen re-asks the chain, and why it is not one number.
 *
 * Everything on Home and Credit is a figure somebody else can change: a deposit finishing its
 * crossing, a relay delivering a message, an operator approving a release. None of those notify
 * the browser, so the only way a screen stays true is to ask again.
 *
 * **The interval has to vary, because the cost does.** A Creditcoin RPC call takes about four
 * seconds, and `useCreditLine` alone makes five. Polling that every few seconds would keep a
 * request in flight more or less permanently for a figure that usually does not move for hours.
 * So the rule is the state, not the clock: while something is in flight, ask often, because the
 * person is watching the screen waiting for it. When nothing is, ask rarely.
 *
 * The fast figure is chosen against what is actually being waited on. BSC and Fuji sign in under a
 * minute, so ten seconds is roughly six looks at the window that matters. Base, Arbitrum and
 * Optimism take fifteen to twenty minutes, where ten seconds is wasteful but harmless, and the
 * alternative is a screen that says "still crossing" for a minute after it is not.
 */

/** Something is in flight and somebody is watching it land. */
export const POLL_ACTIVE = 10_000;

/** Nothing is pending. Slow enough to be free, fast enough that a stale screen is measured in
 *  seconds rather than in however long the tab has been open. */
export const POLL_IDLE = 60_000;

/**
 * The interval to use, given whether anything is pending.
 *
 * A function rather than a ternary at each call site: there are six hooks, and six places to write
 * the same condition is six places for one of them to keep polling at the idle rate through a
 * deposit somebody is waiting on.
 */
export function pollInterval(pending: boolean): number {
  return pending ? POLL_ACTIVE : POLL_IDLE;
}
