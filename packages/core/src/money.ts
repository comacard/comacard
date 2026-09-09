/**
 * IDR amounts are held as bigint minor units (sen, 1/100 rupiah).
 * Floats are never used for money — 0.1 + 0.2 problems become real losses.
 */
export type Idr = bigint;

const MINOR = 100n;

export function idrFromRupiah(rupiah: number): Idr {
  if (!Number.isFinite(rupiah)) throw new RangeError("rupiah must be finite");
  return BigInt(Math.round(rupiah * Number(MINOR)));
}

/** Parse a decimal amount string, e.g. "15000" or "15000.50". */
export function idrFromDecimal(value: string): Idr {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new SyntaxError(`invalid amount: ${value}`);
  const minor = (m[2] ?? "").padEnd(2, "0");
  return BigInt(m[1] as string) * MINOR + BigInt(minor);
}

export function formatIdr(amount: Idr): string {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const rupiah = (abs / MINOR).toLocaleString("id-ID");
  return `${neg ? "-" : ""}Rp ${rupiah}`;
}
