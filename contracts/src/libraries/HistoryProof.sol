// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {CreditErrors} from "../types/CreditTypes.sol";

/// @title HistoryProof
/// @notice Reads an account's external track record out of a proved transaction.
///
/// @dev Two things make this safe, and both are subtle.
///
///      First, `ASCBase` hands the handler only the encoded transaction — not
///      the `chainKey` it was proved against — so the contract cannot otherwise
///      tell a Sepolia proof from a mainnet one. Without a check, anyone could
///      run up a nonce on a testnet and present it as mainnet history. The
///      transaction's own `chainId` is covered by its signature, so reading it
///      back out of the decoded transaction is what pins the claim to a chain.
///
///      Second, the nonce is claimed for `from` — the account that signed the
///      transaction — so a proof can only ever credit its own signer.
library HistoryProof {
    struct Activity {
        address account;
        uint64 nonce;
    }

    /// @param encodedTransaction Verified transaction bytes from the block prover.
    /// @param expectedChainId The chain whose history counts (1 = Ethereum mainnet).
    /// @dev EIP-1559 (type 2) transactions only. Legacy transactions carry their
    ///      chain id folded into `v`, and accepting them would mean trusting a
    ///      reconstruction rather than a plain field.
    function readActivity(bytes memory encodedTransaction, uint64 expectedChainId)
        internal
        pure
        returns (Activity memory)
    {
        EvmV1Decoder.DecodedTransactionType2 memory decoded =
            EvmV1Decoder.decodeTransactionType2(encodedTransaction);

        if (decoded.receipt.receiptStatus != 1) revert CreditErrors.TransactionReverted();
        if (decoded.type2.chainId != expectedChainId) {
            revert CreditErrors.WrongChain(expectedChainId, decoded.type2.chainId);
        }

        return Activity({account: decoded.commonTx.from, nonce: decoded.commonTx.nonce});
    }
}
