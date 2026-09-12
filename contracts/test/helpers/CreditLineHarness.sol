// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ASCCreditLine} from "../../src/creditcoin/ASCCreditLine.sol";

/// @notice Exposes the post-verification path so borrowing can be tested without
///         standing up the block prover precompile, which does not exist in a
///         local EVM. The proof machinery itself lives in ASCBase.
contract CreditLineHarness is ASCCreditLine {
    function exposedProcess(uint8 action, bytes32 queryId, bytes memory encodedTx) external {
        _processAndEmitEvent(action, queryId, encodedTx);
    }

    function applyCollateral(bytes32 queryId, bytes memory encodedTx, bool isLock) external {
        _applyCollateral(queryId, encodedTx, isLock);
    }

    /// @notice Seed account state directly, standing in for a proved history.
    function seed(
        address account,
        uint256 collateral,
        uint64 cycles,
        uint64 repays,
        uint64 provenNonce
    ) external {
        _accounts[account].collateral = collateral;
        _accounts[account].cycleCount = cycles;
        _accounts[account].repayCount = repays;
        _accounts[account].provenNonce = provenNonce;
    }

    function applyTokenCollateral(bytes32 queryId, bytes memory encodedTx, bool isLock) external {
        _applyTokenCollateral(queryId, encodedTx, isLock);
    }

    /// @notice Put token collateral in place without a proof, for tests about
    ///         scale rather than about proving.
    function seedToken(address account, address token, uint256 amount) external {
        tokenCollateral[account][token] = amount;
    }

    function importHistory(bytes32 queryId, bytes memory encodedTx) external {
        _importHistory(queryId, encodedTx);
    }
}
