import { parseEther, parseUnits } from "viem";
import { collateralizationBps, collateralValue, limitFrom } from "../credit";

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
