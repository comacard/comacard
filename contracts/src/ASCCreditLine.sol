// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";

/// @title ASCCreditLine
/// @notice A revolving credit line on Creditcoin whose limit is derived from
///         events proved on other chains.
/// @dev    Attestcoin proves transactions and their logs — never balances — so
///         every input here is an observed event. `ASCBase.execute` handles
///         inclusion proof verification and replay protection; this contract
///         only interprets the verified transaction.
contract ASCCreditLine is ASCBase {
    uint8 internal constant ACTION_COLLATERAL_LOCKED = 0;
    uint8 internal constant ACTION_COLLATERAL_UNLOCKED = 1;

    // keccak256("CollateralLocked(address,uint256,uint256)")
    bytes32 internal constant COLLATERAL_LOCKED_SIG =
        0xaff82f4178df227ea409be11c927e414a908fb01481236913cec80ea866b2468;

    /// @notice The SourceVault whose events this line trusts. Without this
    ///         check anyone could deploy a lookalike contract, emit the same
    ///         event, and have it proved as genuine.
    address public immutable SOURCE_VAULT;

    mapping(address => uint256) public collateralOf;

    event CollateralCredited(address indexed account, uint256 amount, bytes32 queryId);

    error UnknownAction(uint8 action);
    error TransactionReverted();
    error NoMatchingEvent();
    error UntrustedEmitter(address emitter);

    constructor(address sourceVault) {
        SOURCE_VAULT = sourceVault;
    }

    /// @inheritdoc ASCBase
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        override
    {
        if (action == ACTION_COLLATERAL_LOCKED) {
            _creditCollateral(queryId, encodedTransaction);
        } else {
            revert UnknownAction(action);
        }
    }

    function _creditCollateral(bytes32 queryId, bytes memory encodedTransaction) internal {
        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert TransactionReverted();

        EvmV1Decoder.LogEntry[] memory logs =
            EvmV1Decoder.getLogsByEventSignature(receipt, COLLATERAL_LOCKED_SIG);
        if (logs.length == 0) revert NoMatchingEvent();

        for (uint256 i = 0; i < logs.length; ++i) {
            EvmV1Decoder.LogEntry memory entry = logs[i];
            if (entry.address_ != SOURCE_VAULT) revert UntrustedEmitter(entry.address_);

            address account = address(uint160(uint256(entry.topics[1])));
            uint256 amount = abi.decode(entry.data, (uint256));

            collateralOf[account] += amount;
            emit CollateralCredited(account, amount, queryId);
        }
    }
}
