import { parseEther, parseUnits } from "viem";
import {
  amountFromValue,
  collateralizationBps,
  collateralValue,
  limitFrom,
  releasableValue,
} from "../credit";

test("reproduces the limit from the recorded testnet run", () => {
  // docs/e2e-testnet-run.md: 0.0006 ETH at 1000 tCTC per ETH is 0.6 tCTC of collateral, and at
  // score 42 that supported exactly 0.497512437810945273 tCTC on chain.
  const value = collateralValue(parseEther("0.0006"), 18, parseEther("1000"));
  expect(value).toBe(parseEther("0.6"));
  expect(collateralizationBps(42n)).toBe(12_060n);
  expect(limitFrom(value, 42n)).toBe(497_512_437_810_945_273n);
});

test("a fresh account over-collateralises by 150%", () => {
  expect(collateralizationBps(0n)).toBe(15_000n);
  expect(limitFrom(parseEther("0.6"), 0n)).toBe(parseEther("0.4"));
});

test("a perfect record floors the requirement at 80% and is not exceeded above 100", () => {
  expect(collateralizationBps(100n)).toBe(8_000n);
  expect(collateralizationBps(250n)).toBe(8_000n);
});

test("prices a 6-decimal token against its own decimals", () => {
  // 1000 tUSDC at 1 tCTC per whole token. Reading it as 18dp would value it at a trillionth.
  const value = collateralValue(parseUnits("1000", 6), 6, parseEther("1"));
  expect(value).toBe(parseEther("1000"));
});

/**
 * The withdrawal ceiling. `requestRelease` debits first and then asks the credit line whether the
 * borrower can still carry their debt, reverting `ReleaseWouldStrandDebt` if not. These solve the
 * same inequality from the other side so nobody has to find the edge by paying gas to hit it.
 */

test("with nothing drawn, every last wei of collateral is free", () => {
  expect(releasableValue(50_000000000000000000n, 0n, 0n)).toBe(50_000000000000000000n);
});

test("what is kept back is what the debt needs, at this score's ratio", () => {
  // Score 0 requires 150%. Owing 10 means 15 has to stay, so 50 - 15 = 35 is free.
  expect(releasableValue(50n * 10n ** 18n, 10n * 10n ** 18n, 0n)).toBe(35n * 10n ** 18n);
  // Score 100 requires 80%: 10 owed keeps 8 back, freeing 42.
  expect(releasableValue(50n * 10n ** 18n, 10n * 10n ** 18n, 100n)).toBe(42n * 10n ** 18n);
});

test("a debt the collateral barely covers frees nothing, and never a negative", () => {
  // 15 of collateral against 10 drawn at score 0 is exactly the requirement.
  expect(releasableValue(15n * 10n ** 18n, 10n * 10n ** 18n, 0n)).toBe(0n);
  // Under-collateralised — repricing can do this — and the answer is zero, not a negative that
  // would underflow a bigint subtraction downstream.
  expect(releasableValue(5n * 10n ** 18n, 10n * 10n ** 18n, 0n)).toBe(0n);
});

test("the requirement rounds up, so the ceiling is never a wei too generous", () => {
  // 1 wei drawn at score 0 needs 1.5 wei of collateral, which must round to 2 rather than 1.
  expect(releasableValue(10n, 1n, 0n)).toBe(8n);
});

test("the free value round-trips into an amount of the asset", () => {
  // 6-decimal USDC at 1 tCTC per whole token: 35 tCTC of room is 35 USDC, not 35e12 of them.
  const free = releasableValue(50n * 10n ** 18n, 10n * 10n ** 18n, 0n);
  const amount = amountFromValue(free, 6, 10n ** 18n);
  expect(amount).toBe(35_000000n);
  expect(collateralValue(amount, 6, 10n ** 18n)).toBe(free);
});

test("an unpriced asset yields no amount rather than dividing by zero", () => {
  expect(amountFromValue(10n ** 18n, 18, 0n)).toBe(0n);
});
