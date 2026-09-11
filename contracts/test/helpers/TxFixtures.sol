// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @notice Builds the encoded-transaction bytes the block prover hands back,
///         so the decoding and emitter checks can be exercised without a live
///         Attestcoin deployment.
/// @dev Mirrors EvmV1Decoder's layout: abi.encode(txType, chunks), where
///      chunks[0] is the common fields, chunks[1] is type-specific and
///      chunks[2] is the receipt carrying the logs.
library TxFixtures {
    /// @dev keccak256("CollateralLocked(address,uint256,uint256)")
    bytes32 internal constant LOCKED_SIG =
        0xaff82f4178df227ea409be11c927e414a908fb01481236913cec80ea866b2468;

    function collateralLog(address emitter, address account, uint256 amount, uint256 nonce)
        internal
        pure
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = LOCKED_SIG;
        topics[1] = bytes32(uint256(uint160(account)));
        return EvmV1Decoder.LogEntryTuple({
            address_: emitter, topics: topics, data: abi.encode(amount, nonce)
        });
    }

    function tokenLog(
        address emitter,
        bytes32 sig,
        address account,
        address token,
        uint256 amount,
        uint256 nonce
    ) internal pure returns (EvmV1Decoder.LogEntryTuple memory) {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = sig;
        topics[1] = bytes32(uint256(uint160(account)));
        topics[2] = bytes32(uint256(uint160(token)));
        return EvmV1Decoder.LogEntryTuple({
            address_: emitter, topics: topics, data: abi.encode(amount, nonce)
        });
    }

    function logWithSignature(address emitter, bytes32 sig, address account, uint256 amount)
        internal
        pure
        returns (EvmV1Decoder.LogEntryTuple memory)
    {
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = sig;
        topics[1] = bytes32(uint256(uint160(account)));
        return EvmV1Decoder.LogEntryTuple({
            address_: emitter, topics: topics, data: abi.encode(amount, uint256(0))
        });
    }

    function encode(uint8 receiptStatus, EvmV1Decoder.LogEntryTuple[] memory logs)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] =
            abi.encode(uint64(0), uint64(0), address(0), false, address(0), uint256(0), bytes(""));
        chunks[1] = bytes("");
        chunks[2] = abi.encode(receiptStatus, uint64(0), logs, bytes(""));
        return abi.encode(uint8(2), chunks);
    }

    /// @notice A full EIP-1559 transaction, carrying the signed chain id that
    ///         `HistoryProof` uses to pin a claim to Ethereum mainnet.
    function historyTx(address from, uint64 nonce, uint64 chainId)
        internal
        pure
        returns (bytes memory)
    {
        bytes[] memory chunks = new bytes[](3);
        chunks[0] =
            abi.encode(nonce, uint64(21000), from, false, address(0xdead), uint256(0), bytes(""));
        chunks[1] = abi.encode(
            chainId,
            uint128(1 gwei),
            uint128(2 gwei),
            new EvmV1Decoder.AccessListEntryBytes32[](0),
            uint8(0),
            bytes32(0),
            bytes32(0)
        );
        chunks[2] =
            abi.encode(uint8(1), uint64(21000), new EvmV1Decoder.LogEntryTuple[](0), bytes(""));
        return abi.encode(uint8(2), chunks);
    }

    function single(EvmV1Decoder.LogEntryTuple memory log) internal pure returns (bytes memory) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = log;
        return encode(1, logs);
    }
}
