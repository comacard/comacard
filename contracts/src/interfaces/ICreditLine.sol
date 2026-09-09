// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CreditAccount} from "../types/CreditTypes.sol";

/// @title ICreditLine
/// @notice A revolving credit line on Creditcoin, sized by proved history.
interface ICreditLine {
    event CollateralCredited(address indexed account, uint256 amount, bytes32 indexed queryId);
    event CollateralReleased(address indexed account, uint256 amount, bytes32 indexed queryId);
    event Drawn(address indexed account, uint256 amount, uint256 outstanding, uint64 dueAt);
    event Repaid(address indexed account, uint256 amount, uint256 outstanding);

    /// @notice Borrow against the line, up to the available limit.
    function draw(uint256 amount) external;

    /// @notice Repay outstanding principal. Full repayment improves the score.
    function repay() external payable;

    /// @notice Current limit for an account, derived from its attested history.
    function limitOf(address account) external view returns (uint256);

    /// @notice Credit still drawable after what is already outstanding.
    function availableOf(address account) external view returns (uint256);

    /// @notice Close an overdue position as a default. Permissionless.
    function markDefaulted(address borrower) external;

    /// @notice Credit score from 0 to 100.
    function scoreOf(address account) external view returns (uint256);

    /// @notice Full accounting state for an account.
    function accountOf(address account) external view returns (CreditAccount memory);
}
