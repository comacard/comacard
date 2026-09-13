import {
  forgetPending,
  pendingFor,
  readPending,
  rememberPending,
  sequenceFromReceipt,
} from "../pendingRelease";

/**
 * The window where a release exists and no contract reports it.
 *
 * `requestRelease` debits the hub immediately; `releasable` on the far vault fills in only once the
 * signature is submitted. Between them `credited` is 0 and `releasable` is 0, and the withdraw
 * screen concluded there was nothing to show. That fired on a live withdrawal.
 */

const LOG_MESSAGE_PUBLISHED =
  "0x6eb224fb001ed210e379b335e35efe88672a8ce935d981a6896b27ffdf52a3b2" as const;

const word = (value: bigint) => value.toString(16).padStart(64, "0");

beforeEach(() => window.localStorage.clear());

test("reads the sequence out of LogMessagePublished", () => {
  // Only `sender` is indexed, so the sequence is the first word of the data rather than a topic.
  // This is the one way to get it: a contract's return value is not in a receipt at all.
  const logs = [
    { topics: ["0xdeadbeef" as `0x${string}`], data: "0x00" as `0x${string}` },
    {
      topics: [LOG_MESSAGE_PUBLISHED, "0xabc" as `0x${string}`],
      data: `0x${word(8n)}${word(0n)}` as `0x${string}`,
    },
  ];

  expect(sequenceFromReceipt(logs)).toBe(8n);
});

test("a receipt with no published message is null, not zero", () => {
  // Sequence zero is a real sequence. Returning it for "no message found" would send the app
  // fetching a VAA that belongs to somebody else's first ever release.
  expect(sequenceFromReceipt([{ topics: ["0xdead" as `0x${string}`], data: "0x" }])).toBeNull();
});

test("remembers a request and finds it again by asset", () => {
  rememberPending({ assetId: "0xABC", sequence: "8", amount: "10000000000000000" });

  // Case-insensitive: ids arrive from a route param, a hook and a log, and they do not agree on it.
  expect(pendingFor(readPending(), "0xabc")?.sequence).toBe("8");
});

test("one entry per asset, so a second request replaces the first", () => {
  rememberPending({ assetId: "0xabc", sequence: "8", amount: "1" });
  rememberPending({ assetId: "0xabc", sequence: "9", amount: "2" });

  const all = readPending();
  expect(all).toHaveLength(1);
  expect(all[0]?.sequence).toBe("9");
});

test("forgetting one leaves the others", () => {
  rememberPending({ assetId: "0xabc", sequence: "8", amount: "1" });
  rememberPending({ assetId: "0xdef", sequence: "9", amount: "2" });

  forgetPending("0xABC");

  expect(readPending().map((e) => e.assetId)).toEqual(["0xdef"]);
});

test("a request older than a week is dropped rather than kept forever", () => {
  const eightDays = Date.now() - 8 * 24 * 60 * 60 * 1000;
  window.localStorage.setItem(
    "comacard.release.pending.v1",
    JSON.stringify([{ assetId: "0xabc", sequence: "8", amount: "1", at: eightDays }]),
  );

  expect(readPending()).toEqual([]);
});

test("a malformed entry is skipped rather than rendered", () => {
  // This lives somewhere a person can edit. Nothing here moves money: the sequence only fetches a
  // signature the relay verifies anyway. But a half-written entry must not reach the screen.
  window.localStorage.setItem(
    "comacard.release.pending.v1",
    JSON.stringify([{ assetId: "0xabc" }, { sequence: "8" }, "nonsense"]),
  );

  expect(readPending()).toEqual([]);
});

test("unparseable storage is empty, not a thrown render", () => {
  window.localStorage.setItem("comacard.release.pending.v1", "{not json");
  expect(readPending()).toEqual([]);
});
