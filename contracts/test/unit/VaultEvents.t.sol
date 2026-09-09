// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {EvmV1Decoder} from "@gluwa/asc-contracts/contracts/common/EvmV1Decoder.sol";
import {VaultEvents} from "../../src/libraries/VaultEvents.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";

/// @dev `VaultEvents.extract` is an internal library function, so calling it
///      directly would inline it into the test and `expectRevert` would never
///      see an external frame. This wrapper gives the reverts somewhere to land.
contract VaultEventsWrapper {
    function extract(bytes memory encodedTransaction, bytes32 sig, address trustedVault)
        external
        pure
        returns (VaultEvents.CollateralEvent[] memory)
    {
        return VaultEvents.extract(encodedTransaction, sig, trustedVault);
    }
}

contract VaultEventsTest is Test {
    VaultEventsWrapper internal decoder = new VaultEventsWrapper();

    address internal vault = makeAddr("sourceVault");
    address internal impostor = makeAddr("impostor");
    address internal alice = makeAddr("alice");

    function test_extractsAccountAmountAndNonce() public view {
        bytes memory encoded = TxFixtures.single(TxFixtures.collateralLog(vault, alice, 5 ether, 7));

        VaultEvents.CollateralEvent[] memory found =
            decoder.extract(encoded, VaultEvents.COLLATERAL_LOCKED_SIG, vault);

        assertEq(found.length, 1);
        assertEq(found[0].account, alice);
        assertEq(found[0].amount, 5 ether);
        assertEq(found[0].nonce, 7);
    }

    /// The core security property: a lookalike contract emitting an identical
    /// event must not be able to mint credit. Attestcoin proves the transaction
    /// happened, not that it came from a contract we trust.
    function test_rejectsEventFromAnImpostorContract() public {
        bytes memory encoded =
            TxFixtures.single(TxFixtures.collateralLog(impostor, alice, 1000 ether, 0));

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UntrustedEmitter.selector, impostor));
        decoder.extract(encoded, VaultEvents.COLLATERAL_LOCKED_SIG, vault);
    }

    /// One genuine log alongside a forged one must poison the whole batch,
    /// not be silently partially accepted.
    function test_rejectsMixedBatchContainingAnImpostor() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](2);
        logs[0] = TxFixtures.collateralLog(vault, alice, 1 ether, 0);
        logs[1] = TxFixtures.collateralLog(impostor, alice, 999 ether, 1);

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UntrustedEmitter.selector, impostor));
        decoder.extract(TxFixtures.encode(1, logs), VaultEvents.COLLATERAL_LOCKED_SIG, vault);
    }

    function test_rejectsRevertedTransaction() public {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = TxFixtures.collateralLog(vault, alice, 1 ether, 0);

        vm.expectRevert(CreditErrors.TransactionReverted.selector);
        decoder.extract(TxFixtures.encode(0, logs), VaultEvents.COLLATERAL_LOCKED_SIG, vault);
    }

    function test_rejectsTransactionWithNoMatchingEvent() public {
        bytes memory encoded = TxFixtures.single(
            TxFixtures.logWithSignature(vault, keccak256("SomethingElse(uint256)"), alice, 1 ether)
        );

        vm.expectRevert(CreditErrors.NoMatchingEvent.selector);
        decoder.extract(encoded, VaultEvents.COLLATERAL_LOCKED_SIG, vault);
    }

    /// Lock and unlock must not be confusable: proving an unlock against the
    /// lock signature must find nothing rather than credit collateral.
    function test_lockAndUnlockSignaturesDoNotCollide() public {
        assertTrue(VaultEvents.COLLATERAL_LOCKED_SIG != VaultEvents.COLLATERAL_UNLOCKED_SIG);

        bytes memory encoded = TxFixtures.single(
            TxFixtures.logWithSignature(vault, VaultEvents.COLLATERAL_UNLOCKED_SIG, alice, 1 ether)
        );
        vm.expectRevert(CreditErrors.NoMatchingEvent.selector);
        decoder.extract(encoded, VaultEvents.COLLATERAL_LOCKED_SIG, vault);
    }

    function testFuzz_roundTripsAnyAmountAndNonce(uint256 amount, uint256 nonce, address who)
        public
        view
    {
        vm.assume(who != address(0));
        bytes memory encoded =
            TxFixtures.single(TxFixtures.collateralLog(vault, who, amount, nonce));

        VaultEvents.CollateralEvent[] memory found =
            decoder.extract(encoded, VaultEvents.COLLATERAL_LOCKED_SIG, vault);

        assertEq(found[0].account, who);
        assertEq(found[0].amount, amount);
        assertEq(found[0].nonce, nonce);
    }
}
