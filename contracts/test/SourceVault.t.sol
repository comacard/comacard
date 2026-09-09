// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SourceVault} from "../src/SourceVault.sol";

contract SourceVaultTest is Test {
    SourceVault internal vault;
    address internal alice = address(0xA11CE);

    function setUp() public {
        vault = new SourceVault();
        vm.deal(alice, 10 ether);
    }

    function test_lockRecordsBalanceAndEmits() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit SourceVault.CollateralLocked(alice, 1 ether, 0);
        vault.lock{value: 1 ether}();

        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(vault.nonceOf(alice), 1);
    }

    function test_lockRejectsZero() public {
        vm.prank(alice);
        vm.expectRevert(SourceVault.NothingLocked.selector);
        vault.lock{value: 0}();
    }

    function test_unlockReturnsFundsAndDebits() public {
        vm.startPrank(alice);
        vault.lock{value: 2 ether}();
        uint256 before = alice.balance;
        vault.unlock(1 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(alice.balance, before + 1 ether);
    }

    function test_unlockCannotExceedBalance() public {
        vm.startPrank(alice);
        vault.lock{value: 1 ether}();
        vm.expectRevert(SourceVault.InsufficientBalance.selector);
        vault.unlock(2 ether);
        vm.stopPrank();
    }

    /// Balances must never be drainable beyond what was locked.
    function testFuzz_unlockNeverExceedsLocked(uint96 locked, uint96 requested) public {
        vm.assume(locked > 0);
        vm.deal(alice, locked);
        vm.startPrank(alice);
        vault.lock{value: locked}();
        if (requested == 0 || requested > locked) {
            vm.expectRevert(SourceVault.InsufficientBalance.selector);
            vault.unlock(requested);
        } else {
            vault.unlock(requested);
            assertEq(vault.balanceOf(alice), uint256(locked) - requested);
        }
        vm.stopPrank();
    }
}
