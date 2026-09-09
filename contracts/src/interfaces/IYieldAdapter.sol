// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IYieldAdapter
/// @notice Where idle credit-line liquidity goes to earn while it waits to be drawn.
/// @dev The credit line deliberately knows nothing about the venue. Creditcoin
///      has no staking precompile — bonding CTC is a Substrate-only operation
///      and "only EVM accounts can interact with smart contracts" — so today's
///      implementation is operator-mediated. When a staking precompile ships,
///      a trustless adapter replaces it without the credit line changing.
interface IYieldAdapter {
    /// @notice Principal currently deployed plus rewards reported against it.
    function totalAssets() external view returns (uint256);

    /// @notice Principal handed to the venue and not yet returned.
    function deployedPrincipal() external view returns (uint256);

    /// @notice Liquidity sitting in the adapter, immediately withdrawable.
    function idleBalance() external view returns (uint256);

    /// @notice Accept liquidity from the credit line.
    function deposit() external payable;

    /// @notice Return liquidity to the credit line.
    /// @param amount Amount to send back.
    /// @return withdrawn Amount actually returned, never more than requested.
    function withdraw(uint256 amount) external returns (uint256 withdrawn);

    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
}
