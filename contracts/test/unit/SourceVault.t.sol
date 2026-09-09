// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {Deployers} from "../helpers/Deployers.sol";

import {SourceVault} from "../../src/source/SourceVault.sol";
import {ISourceVault} from "../../src/interfaces/ISourceVault.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";

contract SourceVaultTest is Test {
    SourceVault internal vault;
    address internal operator;
    address internal alice = address(0xA11CE);

    function setUp() public {
        operator = makeAddr("operator");
        vault = Deployers.sourceVault(makeAddr("governance"), operator);
        vm.deal(alice, 10 ether);
    }

    function test_lockRecordsBalanceAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit ISourceVault.CollateralLocked(alice, 1 ether, 0);
        vm.prank(alice);
        vault.lock{value: 1 ether}();

        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(vault.nonceOf(alice), 1);
    }

    function test_lockRejectsZero() public {
        vm.prank(alice);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        vault.lock{value: 0}();
    }

    /// Collateral must not be withdrawable until the operator clears the debt.
    function test_unlockBlockedWithoutRelease() public {
        vm.startPrank(alice);
        vault.lock{value: 1 ether}();
        vm.expectRevert(CreditErrors.InsufficientCollateral.selector);
        vault.unlock(1 ether);
        vm.stopPrank();
    }

    function test_unlockAfterReleaseReturnsFunds() public {
        vm.prank(alice);
        vault.lock{value: 2 ether}();

        vm.prank(operator);
        vault.approveRelease(alice, 1 ether);

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.unlock(1 ether);

        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(alice.balance, before + 1 ether);
        assertEq(vault.releasable(alice), 0);
    }

    function test_releaseCannotExceedCollateral() public {
        vm.prank(alice);
        vault.lock{value: 1 ether}();
        vm.prank(operator);
        vm.expectRevert(CreditErrors.InsufficientCollateral.selector);
        vault.approveRelease(alice, 2 ether);
    }

    function test_onlyOperatorMayApprove() public {
        bytes32 operatorRole = vault.OPERATOR_ROLE();
        vm.prank(alice);
        vault.lock{value: 1 ether}();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, alice, operatorRole
            )
        );
        vault.approveRelease(alice, 1 ether);
    }

    /// A release must never let more leave the vault than was put in.
    function testFuzz_withdrawalNeverExceedsLocked(uint96 locked, uint96 approved, uint96 taken)
        public
    {
        locked = uint96(bound(locked, 1, 100 ether));
        approved = uint96(bound(approved, 0, locked));
        vm.deal(alice, locked);

        vm.prank(alice);
        vault.lock{value: locked}();
        vm.prank(operator);
        vault.approveRelease(alice, approved);

        vm.prank(alice);
        if (taken == 0 || taken > approved) {
            vm.expectRevert();
            vault.unlock(taken);
        } else {
            vault.unlock(taken);
            assertEq(vault.balanceOf(alice), uint256(locked) - taken);
        }
        assertLe(address(vault).balance, locked);
    }
}
