// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title CollateralMessage
/// @notice The payload a vault sends when collateral is locked, and the credit
///         line reads when it arrives.
///
/// @dev Addresses travel as `bytes32`, not `address`. Every EVM chain would be
///      happy with twenty bytes, but Wormhole reaches chains whose addresses are
///      thirty-two, and a payload that cannot carry them would have to be
///      redesigned the first time one is added.
///
///      The version byte is first so an old credit line refuses a new payload
///      rather than misreading it.
library CollateralMessage {
    uint8 internal constant VERSION = 1;

    struct Deposit {
        address account;
        bytes32 token; // zero for the chain's native coin
        uint256 amount;
        uint8 decimals;
    }

    error UnsupportedVersion(uint8 version);

    function encode(Deposit memory d) internal pure returns (bytes memory) {
        return
            abi.encode(VERSION, bytes32(uint256(uint160(d.account))), d.token, d.amount, d.decimals);
    }

    function decode(bytes memory payload) internal pure returns (Deposit memory d) {
        (uint8 version, bytes32 account, bytes32 token, uint256 amount, uint8 decimals) =
            abi.decode(payload, (uint8, bytes32, bytes32, uint256, uint8));
        if (version != VERSION) revert UnsupportedVersion(version);

        d.account = address(uint160(uint256(account)));
        d.token = token;
        d.amount = amount;
        d.decimals = decimals;
    }

    /// @notice Identity of an asset across chains.
    /// @dev USDC on Base and USDC on Arbitrum are different assets with the same
    ///      name. Keying on the token address alone would price one as the
    ///      other, so the chain is part of the key.
    function assetId(uint16 chainId, bytes32 token) internal pure returns (bytes32) {
        // forge-lint: disable-next-line(asm-keccak256)
        return keccak256(abi.encodePacked(chainId, token));
    }
}
