import { createHmac } from "node:crypto";

/**
 * A card is derived, not stored. HMAC(secret, wallet) is the only source of
 * entropy, so the same wallet always gets the same card and nothing has to be
 * written anywhere when KYC clears. Rotating CARD_SECRET reissues every card.
 *
 * ponytail: no reissue/replace for one wallet. Add a per-wallet salt in a
 * table if a card ever has to be revoked without rotating the secret.
 */

/** Private-use BIN prefix. Deliberately not a real network's range. */
const BIN = "9924";
const CARD_YEARS = 4;

export type IssuedCard = {
  number: string;
  masked: string;
  accountNumber: string;
  cvv: string;
  expiry: string; // MM/YY
  expiresAt: number; // unix seconds
  issuedAt: number; // unix seconds
};

/** Standard mod-10 check digit for a digit string. */
export function luhnCheckDigit(partial: string): string {
  let sum = 0;
  let double = true;
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = Number(partial[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return String((10 - (sum % 10)) % 10);
}

export function luhnValid(number: string): boolean {
  return /^\d{2,}$/.test(number) && luhnCheckDigit(number.slice(0, -1)) === number.slice(-1);
}

/** Digits from a hash, as many as asked for, without modulo bias mattering here. */
function digits(hex: string, count: number): string {
  let out = "";
  for (let i = 0; out.length < count; i += 2) {
    if (i + 2 > hex.length) throw new Error("hash exhausted");
    out += String(Number.parseInt(hex.slice(i, i + 2), 16) % 10);
  }
  return out;
}

export function issueCard(wallet: string, issuedAt: number, secret: string): IssuedCard {
  const w = wallet.toLowerCase();
  const mac = (label: string) => createHmac("sha256", secret).update(`${label}:${w}`).digest("hex");

  const body = BIN + digits(mac("pan"), 15 - BIN.length);
  const number = body + luhnCheckDigit(body);
  const accountNumber = digits(mac("account"), 12);
  const cvv = digits(mac("cvv"), 3);

  const issued = new Date(issuedAt * 1000);
  const exp = new Date(
    Date.UTC(issued.getUTCFullYear() + CARD_YEARS, issued.getUTCMonth() + 1, 0, 23, 59, 59),
  );
  const mm = String(exp.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(exp.getUTCFullYear()).slice(-2);

  return {
    number,
    masked: `•••• •••• •••• ${number.slice(-4)}`,
    accountNumber,
    cvv,
    expiry: `${mm}/${yy}`,
    expiresAt: Math.floor(exp.getTime() / 1000),
    issuedAt,
  };
}
