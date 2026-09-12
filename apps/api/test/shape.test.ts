import { describe, expect, test } from "bun:test";
import { cardState, decodeAccount, formatCtc } from "../src/shape";

const verified = { status: "Approved", verified: true, sessionId: "s", name: "Test", updatedAt: 1 };
const unverified = {
  status: "none",
  verified: false,
  sessionId: null,
  name: null,
  updatedAt: null,
};

describe("formatCtc", () => {
  test("four decimals, truncated, no float", () => {
    expect(formatCtc(0n)).toBe("0.0000");
    expect(formatCtc(40n * 10n ** 18n)).toBe("40.0000");
    expect(formatCtc(6666666666666666n)).toBe("0.0066");
    expect(formatCtc(1234567890123456789n)).toBe("1.2345");
  });
});

const position = (drawn = 0n, dueAt = 0) => ({ drawn, dueAt });

describe("cardState", () => {
  test("kyc gate comes first", () => {
    expect(cardState(unverified, position(), 5n, 100)).toEqual({
      active: false,
      spendable: "0",
      reason: "kyc_required",
    });
  });
  test("verified with nothing drawn is active, even at a zero limit", () => {
    expect(cardState(verified, position(), 0n, 100)).toEqual({ active: true, spendable: "0" });
  });
  test("overdue draw freezes the card", () => {
    expect(cardState(verified, position(1n, 50), 5n, 100)).toMatchObject({
      active: false,
      reason: "overdue",
    });
  });
  test("a draw still inside its term does not", () => {
    expect(cardState(verified, position(1n, 150), 5n, 100).active).toBe(true);
  });
  test("verified with available credit is active", () => {
    expect(cardState(verified, position(), 6666666666666666n, 100)).toEqual({
      active: true,
      spendable: "6666666666666666",
    });
  });
});

describe("decodeAccount", () => {
  const word = (n: bigint) => n.toString(16).padStart(64, "0");
  const encoded = `0x${[10n ** 16n, 42n, 0n, 7n, 99n, 5n, 3n, 3n, 0n].map(word).join("")}`;

  test("reads the struct positionally", () => {
    expect(decodeAccount(encoded)).toEqual({
      collateral: 10n ** 16n,
      drawn: 42n,
      pendingRelease: 0n,
      drawnAt: 7,
      dueAt: 99,
      provenNonce: 5n,
      cycleCount: 3,
      repayCount: 3,
      defaultCount: 0,
    });
  });
  test("a struct of the wrong shape fails loudly, never silently", () => {
    expect(() => decodeAccount(`0x${word(1n).repeat(8)}`)).toThrow("expected 9 words");
  });
});
