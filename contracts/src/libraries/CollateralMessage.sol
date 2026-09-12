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
    /// @notice A vault telling Creditcoin it is holding collateral.
    uint8 internal constant VERSION = 1;

    /// @notice Creditcoin telling a vault it may let collateral go.
    /// @dev Same layout, different first byte. A vault deployed before releases
    ///      existed rejects one as an unsupported version rather than reading it
    ///      as a deposit, which is the whole reason the version leads.
    uint8 internal constant VERSION_RELEASE = 2;

    struct Deposit {
        address account;
        bytes32 token; // zero for the chain's native coin
        uint256 amount;
        uint8 decimals;
    }

    error UnsupportedVersion(uint8 version);

    function encode(Deposit memory d) internal pure returns (bytes memory) {
        return encodeAs(VERSION, d);
    }

    function decode(bytes memory payload) internal pure returns (Deposit memory d) {
        return decodeAs(VERSION, payload);
    }

    function encodeRelease(Deposit memory d) internal pure returns (bytes memory) {
        return encodeAs(VERSION_RELEASE, d);
    }

    function decodeRelease(bytes memory payload) internal pure returns (Deposit memory d) {
        return decodeAs(VERSION_RELEASE, payload);
    }

    function encodeAs(uint8 version, Deposit memory d) internal pure returns (bytes memory) {
        return
            abi.encode(version, bytes32(uint256(uint160(d.account))), d.token, d.amount, d.decimals);
    }

    /// @dev Refuses any version but the one asked for. A deposit handler handed
    ///      a release, or the reverse, must fail rather than act on it.
    function decodeAs(uint8 expected, bytes memory payload)
        internal
        pure
        returns (Deposit memory d)
    {
        (uint8 version, bytes32 account, bytes32 token, uint256 amount, uint8 decimals) =
            abi.decode(payload, (uint8, bytes32, bytes32, uint256, uint8));
        if (version != expected) revert UnsupportedVersion(version);

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
