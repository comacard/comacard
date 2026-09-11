// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {CreditErrors} from "../types/CreditTypes.sol";

/// @title VaultEvents
/// @notice Pulls SourceVault events out of a transaction Attestcoin has verified.
/// @dev Attestcoin hands back the whole encoded transaction. Decoding lives here
///      rather than in the credit line so the accounting logic stays readable and
///      the decoding can be tested against raw fixtures on its own.
library VaultEvents {
    /// @dev keccak256("CollateralLocked(address,uint256,uint256)")
    bytes32 internal constant COLLATERAL_LOCKED_SIG =
        0xaff82f4178df227ea409be11c927e414a908fb01481236913cec80ea866b2468;

    /// @dev keccak256("CollateralUnlocked(address,uint256,uint256)")
    bytes32 internal constant COLLATERAL_UNLOCKED_SIG =
        0xe8e7440c7efbb5d2d20a061fde9c0fa35db9764f5da8475a0090ea4f23466c84;

    /// @dev keccak256("TokenLocked(address,address,uint256,uint256)")
    bytes32 internal constant TOKEN_LOCKED_SIG =
        0xd8a1c0afefbfb5f6da58761715434130bcc1b9da12dba1ab5b21e44f5ae4d27e;

    /// @dev keccak256("TokenUnlocked(address,address,uint256,uint256)")
    bytes32 internal constant TOKEN_UNLOCKED_SIG =
        0xe15734182b89bfe9b7c18566f03039cfe6f86105d7a230fdfa76bc295841d658;

    struct TokenEvent {
        address account;
        address token;
        uint256 amount;
        uint256 nonce;
    }

    struct CollateralEvent {
        address account;
        uint256 amount;
        uint256 nonce;
    }

    /// @notice Extract every matching collateral event emitted by `trustedVault`.
    /// @param encodedTransaction Verified transaction bytes from the block prover.
    /// @param eventSig Event signature to select.
    /// @param trustedVault The only contract whose events this system honours.
    /// @dev Without the emitter check anyone could deploy a lookalike contract,
    ///      emit the same event, and have it proved as genuine.
    function extract(bytes memory encodedTransaction, bytes32 eventSig, address trustedVault)
        internal
        pure
        returns (CollateralEvent[] memory found)
    {
        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert CreditErrors.TransactionReverted();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, eventSig);
        if (logs.length == 0) revert CreditErrors.NoMatchingEvent();

        found = new CollateralEvent[](logs.length);
        for (uint256 i = 0; i < logs.length; ++i) {
            EvmV1Decoder.LogEntry memory entry = logs[i];
            if (entry.address_ != trustedVault) {
                revert CreditErrors.UntrustedEmitter(entry.address_);
            }
            (uint256 amount, uint256 nonce) = abi.decode(entry.data, (uint256, uint256));
            found[i] = CollateralEvent({
                account: address(uint160(uint256(entry.topics[1]))), amount: amount, nonce: nonce
            });
        }
    }

    /// @notice Extract every matching token-collateral event from `trustedVault`.
    /// @dev The token is an indexed topic, not data: it identifies *which*
    ///      asset moved, and pricing that asset wrongly is the one mistake that
    ///      turns a correct proof into a bad loan.
    function extractToken(bytes memory encodedTransaction, bytes32 eventSig, address trustedVault)
        internal
        pure
        returns (TokenEvent[] memory found)
    {
        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert CreditErrors.TransactionReverted();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, eventSig);
        if (logs.length == 0) revert CreditErrors.NoMatchingEvent();

        found = new TokenEvent[](logs.length);
        for (uint256 i = 0; i < logs.length; ++i) {
            EvmV1Decoder.LogEntry memory entry = logs[i];
            if (entry.address_ != trustedVault) {
                revert CreditErrors.UntrustedEmitter(entry.address_);
            }
            (uint256 amount, uint256 nonce) = abi.decode(entry.data, (uint256, uint256));
            found[i] = TokenEvent({
                account: address(uint160(uint256(entry.topics[1]))),
                token: address(uint160(uint256(entry.topics[2]))),
                amount: amount,
                nonce: nonce
            });
        }
    }
}
