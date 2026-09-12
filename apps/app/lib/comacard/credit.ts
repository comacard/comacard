/**
 * The limit maths, mirrored from `CreditScoring.sol` so a screen can answer "what does locking this
 * buy me?" before anything is signed.
 *
 * These constants are a copy of on-chain ones, which is a real risk worth naming: change them in
 * Solidity and this file is silently wrong. It is a preview only. Every figure a screen commits to
 * still comes from `limitOf` / `availableOf` read live off the contract, so the worst this can do
 * is misquote an estimate, never misreport a limit.
 *
 * Worked example, matching `docs/e2e-testnet-run.md`: 0.6 tCTC of collateral at score 42 gives
 * bps = 15000 - 7000 x 42/100 = 12060, and 0.6 x 10000 / 12060 = 0.497512437810945273 tCTC.
 */

const MAX_RATIO_BPS = 15_000n; // 150%, what score 0 must over-collateralise by
const MIN_RATIO_BPS = 8_000n; // 80%, the floor a perfect record earns
const MAX_SCORE = 100n;
const BPS = 10_000n;

/** Required collateralisation at a score, in basis points. Falls linearly as the score rises. */
export function collateralizationBps(score: bigint): bigint {
  const bounded = score > MAX_SCORE ? MAX_SCORE : score;
  return MAX_RATIO_BPS - ((MAX_RATIO_BPS - MIN_RATIO_BPS) * bounded) / MAX_SCORE;
}

/** The limit a given collateral value supports at a given score, in credit-asset wei. */
export function limitFrom(collateralValue: bigint, score: bigint): bigint {
  return (collateralValue * BPS) / collateralizationBps(score);
}

/**
 * Credit-asset wei a holding is worth.
 *
 * `price` is per ONE WHOLE token, so the holding is divided by the token's own decimals rather than
 * a fixed 18. That single division is the difference between valuing 6-decimal tUSDC correctly and
 * valuing it at a trillionth of its worth.
 */
export function collateralValue(amount: bigint, decimals: number, price: bigint): bigint {
  return (amount * price) / 10n ** BigInt(decimals);
}
