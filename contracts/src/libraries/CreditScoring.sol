// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CreditAccount} from "../types/CreditTypes.sol";

/// @title CreditScoring
/// @notice Turns proved borrowing behaviour into a credit limit.
///
/// @dev Pure and deliberately legible: a borrower can read the inputs off the
///      chain and recompute their own limit by hand.
///
///      Every input is a *counted event*, never a balance. Attestcoin proves
///      transactions and their logs and nothing else, so wealth is unknowable
///      here — but a transaction's nonce is provable, and so is whether a debt
///      was repaid. That constraint is what makes this a credit score rather
///      than a net-worth check.
library CreditScoring {
    /// @notice Worst collateralisation, applied to an account with no record.
    uint256 internal constant MAX_RATIO_BPS = 15_000; // 150%
    /// @notice Best collateralisation, earned by a spotless record.
    uint256 internal constant MIN_RATIO_BPS = 8_000; // 80%
    uint256 internal constant BPS = 10_000;

    uint256 internal constant MAX_SCORE = 100;
    uint256 internal constant HISTORY_WEIGHT = 40;
    uint256 internal constant RECORD_WEIGHT = 40;
    uint256 internal constant CONSISTENCY_WEIGHT = 20;

    /// @notice Proved external activity beyond this earns no further points.
    uint256 internal constant HISTORY_TARGET = 200;
    /// @notice Repayments beyond this earn no further consistency points.
    uint256 internal constant CONSISTENCY_TARGET = 10;

    /// @notice Score an account from 0 to 100.
    function score(CreditAccount memory account) internal pure returns (uint256) {
        uint256 total = _historyPoints(account.provenNonce)
            + _recordPoints(account.cycleCount, account.repayCount)
            + _consistencyPoints(account.repayCount);
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
    function limit(CreditAccount memory account) internal pure returns (uint256) {
        if (account.collateral == 0) return 0;
        return (account.collateral * BPS) / collateralizationBps(score(account));
    }

    /// @notice Credit still drawable, after what is already outstanding.
    function available(CreditAccount memory account) internal pure returns (uint256) {
        uint256 ceiling = limit(account);
        return ceiling > account.drawn ? ceiling - account.drawn : 0;
    }

    /// @dev Track record elsewhere. A wallet's nonce is the one durable measure
    ///      of activity that a transaction proof can actually establish — age
    ///      cannot, because the decoder exposes no block timestamp.
    function _historyPoints(uint64 provenNonce) private pure returns (uint256) {
        uint256 counted = provenNonce > HISTORY_TARGET ? HISTORY_TARGET : provenNonce;
        return (counted * HISTORY_WEIGHT) / HISTORY_TARGET;
    }

    /// @dev Cycles repaid against cycles concluded. A default concludes a cycle
    ///      without a repayment, which is exactly how it costs the borrower.
    function _recordPoints(uint64 cycleCount, uint64 repayCount) private pure returns (uint256) {
        if (cycleCount == 0) return 0;
        uint256 settled = repayCount > cycleCount ? cycleCount : repayCount;
        return (settled * RECORD_WEIGHT) / cycleCount;
    }

    /// @dev Rewards a sustained record, not a single lucky repayment.
    function _consistencyPoints(uint64 repayCount) private pure returns (uint256) {
        uint256 counted = repayCount > CONSISTENCY_TARGET ? CONSISTENCY_TARGET : repayCount;
        return (counted * CONSISTENCY_WEIGHT) / CONSISTENCY_TARGET;
    }
}
