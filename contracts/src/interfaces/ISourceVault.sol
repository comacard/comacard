// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title ISourceVault
/// @notice Collateral custody on the source chain.
/// @dev Deployed on Ethereum Sepolia. Its events are the facts Creditcoin
///      proves through Attestcoin; the collateral itself never crosses over.
interface ISourceVault {
    /// @param account Depositor.
    /// @param amount Value locked in this transaction.
    /// @param nonce Per-account counter, making otherwise identical locks
    ///        distinguishable when they are proved on Creditcoin.
    event CollateralLocked(address indexed account, uint256 amount, uint256 nonce);
    event CollateralUnlocked(address indexed account, uint256 amount, uint256 nonce);

    function lock() external payable;
    function unlock(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function nonceOf(address account) external view returns (uint256);
}
