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

    /// @notice Creditcoin telling one vault it may let collateral go.
    /// @dev Carries the destination chain, which a deposit does not need — a
    ///      deposit is read by the single hub it was addressed to, while a
    ///      release is read by whichever relay is handed it. Without the chain
    ///      in the signed payload, a release meant for one chain executes on
    ///      every other one, approving that amount out of each vault.
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

    /// @param chainId Wormhole chain id of the vault this release is for, and
    ///        the only one whose relay may act on it.
    function encodeRelease(uint16 chainId, Deposit memory d) internal pure returns (bytes memory) {
        return abi.encode(
            VERSION_RELEASE,
            chainId,
            bytes32(uint256(uint160(d.account))),
            d.token,
            d.amount,
            d.decimals
        );
    }

    function decodeRelease(bytes memory payload)
        internal
        pure
        returns (uint16 chainId, Deposit memory d)
    {
        // Checked before decoding, not after: a deposit and a release no longer
        // share a shape, so abi.decode on the wrong one reverts with nothing to
        // read. Whoever is holding the failing transaction deserves the name.
        if (versionOf(payload) != VERSION_RELEASE) revert UnsupportedVersion(versionOf(payload));

        uint8 version;
        bytes32 account;
        (version, chainId, account, d.token, d.amount, d.decimals) =
            abi.decode(payload, (uint8, uint16, bytes32, bytes32, uint256, uint8));

        d.account = address(uint160(uint256(account)));
    }

    /// @notice The first byte, without decoding the rest.
    function versionOf(bytes memory payload) internal pure returns (uint8 version) {
        if (payload.length < 32) revert UnsupportedVersion(0);
        // forge-lint: disable-next-line(asm-keccak256)
        assembly {
            version := byte(31, mload(add(payload, 32)))
        }
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
        if (versionOf(payload) != expected) {
            revert UnsupportedVersion(versionOf(payload));
        }

        (uint8 version, bytes32 account, bytes32 token, uint256 amount, uint8 decimals) =
            abi.decode(payload, (uint8, bytes32, bytes32, uint256, uint8));
        version;

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
