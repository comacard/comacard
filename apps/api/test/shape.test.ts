import { describe, expect, test } from "bun:test";
import { cardState, formatCtc } from "../src/shape";
import type { IndexedAccount } from "../src/sources";

const account = (over: Partial<IndexedAccount> = {}): IndexedAccount => ({
  id: "0xabc",
  collateral: "0",
  drawn: "0",
  pendingRelease: "0",
  provenNonce: "0",
  score: "0",
  creditLimit: "0",
  available: "0",
  cycleCount: 0,
  repayCount: 0,
  defaultCount: 0,
  dueAt: "0",
  firstSeenAt: "0",
  lastActiveAt: "0",
  ...over,
});
const verified = { status: "Approved", verified: true, sessionId: "s", name: null, updatedAt: 1 };
const unverified = { status: "none", verified: false, sessionId: null, name: null, updatedAt: null };

describe("formatCtc", () => {
  test("four decimals, truncated, no float", () => {
    expect(formatCtc(0n)).toBe("0.0000");
    expect(formatCtc(40n * 10n ** 18n)).toBe("40.0000");
    expect(formatCtc(6666666666666666n)).toBe("0.0066");
    expect(formatCtc(1234567890123456789n)).toBe("1.2345");
  });
});

describe("cardState", () => {
  test("kyc gate comes first", () => {
    expect(cardState(unverified, account(), 5n, 100)).toEqual({
      active: false,
      spendable: "0",
      reason: "kyc_required",
    });
  });
  test("verified with no indexed account → active, nothing to spend yet", () => {
    expect(cardState(verified, null, 0n, 100)).toEqual({ active: true, spendable: "0" });
  });
  test("overdue draw freezes the card", () => {
    const state = cardState(verified, account({ drawn: "1", dueAt: "50" }), 5n, 100);
    expect(state).toMatchObject({ active: false, reason: "overdue" });
  });
  test("verified with available credit is active", () => {
    expect(cardState(verified, account(), 6666666666666666n, 100)).toEqual({
      active: true,
      spendable: "6666666666666666",
    });
  });
});
