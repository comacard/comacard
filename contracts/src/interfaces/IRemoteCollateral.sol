// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice What the credit line needs from a cross-chain collateral hub.
interface IRemoteCollateral {
    /// @notice Everything this account has deposited on other chains, valued in
    ///         the asset the credit line lends.
    function valueOf(address account) external view returns (uint256);
}
