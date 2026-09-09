import { expect, test } from "bun:test";
import {
  type AttestedEvent,
  formatIdr,
  idrFromDecimal,
  profileFrom,
  scoreProfile,
} from "../src/index.js";

const NOW = 1_800_000_000;
const MONTH = 30 * 24 * 60 * 60;

const ev = (kind: AttestedEvent["kind"], monthsAgo: number): AttestedEvent => ({
  kind,
  chainKey: 3,
  blockHeight: 1,
  timestamp: NOW - monthsAgo * MONTH,
  amount: 0n,
  txHash: "0x00",
});

test("empty history scores zero and gets the worst ratio", () => {
  const p = profileFrom([], 1_500_000_00n, NOW);
  expect(p.score).toBe(0);
  expect(p.collateralizationRatio).toBe(150);
  // 150% collateralisation => limit is two thirds of collateral
  expect(p.limit).toBe(1_000_000_00n);
});

test("a long clean repayment record earns undercollateralisation", () => {
  const events = [
    ...Array.from({ length: 10 }, (_, i) => ev("borrowed", 24 - i)),
    ...Array.from({ length: 10 }, (_, i) => ev("repaid", 23 - i)),
  ];
  const p = profileFrom(events, 1_000_000_00n, NOW);
  expect(p.score).toBe(100);
  expect(p.collateralizationRatio).toBe(80);
  expect(p.limit).toBeGreaterThan(1_000_000_00n); // borrows more than it locked
});

test("defaults drag the score down", () => {
  const clean = scoreProfile([ev("borrowed", 12), ev("repaid", 11)], NOW);
  const dirty = scoreProfile([ev("borrowed", 12), ev("borrowed", 11)], NOW);
  expect(dirty).toBeLessThan(clean);
});

test("score never leaves 0..100", () => {
  const many = Array.from({ length: 500 }, () => ev("repaid", 99));
  expect(scoreProfile(many, NOW)).toBeLessThanOrEqual(100);
  expect(scoreProfile([], NOW)).toBeGreaterThanOrEqual(0);
});

test("decimal amounts survive the round trip without float drift", () => {
  expect(idrFromDecimal("15000")).toBe(1_500_000n);
  expect(idrFromDecimal("15000.50")).toBe(1_500_050n);
  expect(idrFromDecimal("0.01")).toBe(1n);
  expect(() => idrFromDecimal("15,000")).toThrow();
  expect(formatIdr(1_500_000n)).toBe("Rp 15.000");
});
