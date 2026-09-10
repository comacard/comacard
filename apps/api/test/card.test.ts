import { describe, expect, test } from "bun:test";
import { issueCard, luhnValid } from "../src/card";

const wallet = "0x3b4F0135465d444A5bd06Ab90fC59B73916C85F5";
const at = 1_788_969_464; // 2026-09-09

describe("issueCard", () => {
  const card = issueCard(wallet, at, "secret");

  test("16 digit Luhn-valid PAN on the private BIN", () => {
    expect(card.number).toMatch(/^9924\d{12}$/);
    expect(luhnValid(card.number)).toBe(true);
    expect(
      luhnValid(`${card.number.slice(0, -1)}${(Number(card.number.slice(-1)) + 1) % 10}`),
    ).toBe(false);
  });
  test("deterministic and case-insensitive on the wallet", () => {
    expect(issueCard(wallet.toLowerCase(), at, "secret")).toEqual(card);
  });
  test("different wallet or secret → different card", () => {
    expect(issueCard("0x0000000000000000000000000000000000000001", at, "secret").number).not.toBe(
      card.number,
    );
    expect(issueCard(wallet, at, "other").number).not.toBe(card.number);
  });
  test("account number, cvv, expiry shapes", () => {
    expect(card.accountNumber).toMatch(/^\d{12}$/);
    expect(card.cvv).toMatch(/^\d{3}$/);
    expect(card.expiry).toBe("09/30");
    expect(card.masked.endsWith(card.number.slice(-4))).toBe(true);
  });
});
