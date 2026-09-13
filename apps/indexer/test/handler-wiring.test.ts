import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Guards against a patch that reports success and changes nothing.
 *
 * Three times today an edit matched text the formatter had already reflowed,
 * applied to nothing, and left a handler on its old behaviour — twice in this
 * file. The symptom is never an error: the indexer runs, reports every chain
 * synced, and quietly produces rows that never advance.
 *
 * So this asserts the shape the handlers must have rather than trusting that an
 * edit landed. Every cross-chain stage goes through recordStage, which is what
 * tolerates the chains syncing out of step; a handler that looks a request up
 * itself and gives up when it is missing is the bug that keeps coming back.
 */
const handler = readFileSync(new URL("../src/handlers/Wormhole.ts", import.meta.url), "utf8");

test("both far-chain stages are recorded through recordStage", () => {
  expect(handler).toContain('recordStage(context, "approved"');
  expect(handler).toContain('recordStage(context, "withdrawn"');
});

test("no far-chain handler gives up when the request is not indexed yet", () => {
  // The old shape: find the withdrawal, bail if absent. It cannot come back
  // without also removing recordStage, which the test above pins.
  const givesUp = /RemoteWithdrawal\.getWhere[\s\S]{0,400}?if \(!oldest\) return;/.test(handler);
  expect(givesUp).toBe(false);
});

test("the request handler collects anything parked before it", () => {
  expect(handler).toContain("collectParkedStages(context");
});

const creditLine = readFileSync(new URL("../src/handlers/CreditLine.ts", import.meta.url), "utf8");

/**
 * The limit over time lives only in ScoreChange rows. Folding the event into
 * Account alone keeps the current value and discards every earlier one, which is
 * how #14 started, and a patch that silently misses this handler would put it
 * back with every chain still reporting synced.
 */
test("every ScoreChanged is kept as a row, not only folded into Account", () => {
  const scoreChanged =
    creditLine.split('event: "ScoreChanged"')[1]?.split("indexer.onEvent")[0] ?? "";
  expect(scoreChanged).toContain("context.ScoreChange.set(");
  expect(scoreChanged).toContain("changed:");
  expect(scoreChanged).toContain("context.Account.set(");
});
