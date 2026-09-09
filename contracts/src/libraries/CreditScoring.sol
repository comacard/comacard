// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CreditAccount} from "../types/CreditTypes.sol";

/// @title CreditScoring
/// @notice Turns attested borrowing behaviour into a credit limit.
/// @dev Pure and deliberately legible: a borrower can read the inputs off the
///      chain and recompute their own limit by hand. Mirrors the `comacard/core` package
///      so the frontend and the contract cannot disagree about a limit.
///
///      Attestcoin proves transactions and their logs, never balances, so every
///      input here is a counted event rather than a snapshot of wealth.
library CreditScoring {
    /// @notice Worst collateralisation, applied to an account with no history.
    uint256 internal constant MAX_RATIO_BPS = 15_000; // 150%
    /// @notice Best collateralisation, earned by a spotless record.
    uint256 internal constant MIN_RATIO_BPS = 8_000; // 80%
    uint256 internal constant BPS = 10_000;

    uint256 internal constant MAX_SCORE = 100;
    uint256 internal constant DEPTH_WEIGHT = 40;
    uint256 internal constant RECORD_WEIGHT = 40;
    uint256 internal constant CONSISTENCY_WEIGHT = 20;

    /// @notice History older than this stops earning depth points.
    uint256 internal constant MAX_HISTORY = 730 days;
    /// @notice Repayments beyond this stop earning consistency points.
    uint256 internal constant CONSISTENCY_TARGET = 10;

    /// @notice Score an account from 0 to 100.
    /// @param account The borrower's accumulated attested activity.
    /// @param nowTs Current block timestamp.
    function score(CreditAccount memory account, uint256 nowTs) internal pure returns (uint256) {
        uint256 depth = _depthPoints(account.firstSeenAt, nowTs);
        uint256 record = _recordPoints(account.borrowCount, account.repayCount);
        uint256 consistency = _consistencyPoints(account.repayCount);

        uint256 total = depth + record + consistency;
        return total > MAX_SCORE ? MAX_SCORE : total;
    }

    /// @notice Collateralisation required at a given score, in basis points.
    /// @dev Falls linearly from 150% at score 0 to 80% at score 100, so a clean
    ///      record is what earns the right to borrow more than was locked.
    function collateralizationBps(uint256 score_) internal pure returns (uint256) {
        uint256 bounded = score_ > MAX_SCORE ? MAX_SCORE : score_;
        return MAX_RATIO_BPS - ((MAX_RATIO_BPS - MIN_RATIO_BPS) * bounded) / MAX_SCORE;
    }

    /// @notice Total credit the account may have outstanding.
    function limit(CreditAccount memory account, uint256 nowTs) internal pure returns (uint256) {
        if (account.collateral == 0) return 0;
        uint256 ratio = collateralizationBps(score(account, nowTs));
        return (account.collateral * BPS) / ratio;
    }

    /// @notice Credit still drawable, after what is already outstanding.
    function available(CreditAccount memory account, uint256 nowTs)
        internal
        pure
        returns (uint256)
    {
        uint256 ceiling = limit(account, nowTs);
        return ceiling > account.drawn ? ceiling - account.drawn : 0;
    }

    /// @dev How long the account has been observably active, capped at two years.
    function _depthPoints(uint64 firstSeenAt, uint256 nowTs) private pure returns (uint256) {
        if (firstSeenAt == 0 || nowTs <= firstSeenAt) return 0;
        uint256 age = nowTs - firstSeenAt;
        if (age > MAX_HISTORY) age = MAX_HISTORY;
        return (age * DEPTH_WEIGHT) / MAX_HISTORY;
    }

    /// @dev Repayments completed against draws taken.
    function _recordPoints(uint64 borrowCount, uint64 repayCount) private pure returns (uint256) {
        if (borrowCount == 0) return 0;
        uint256 settled = repayCount > borrowCount ? borrowCount : repayCount;
        return (uint256(settled) * RECORD_WEIGHT) / borrowCount;
    }

    /// @dev Rewards a sustained record, not a single lucky repayment.
    function _consistencyPoints(uint64 repayCount) private pure returns (uint256) {
        uint256 counted = repayCount > CONSISTENCY_TARGET ? CONSISTENCY_TARGET : repayCount;
        return (counted * CONSISTENCY_WEIGHT) / CONSISTENCY_TARGET;
    }
}
