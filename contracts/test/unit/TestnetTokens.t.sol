// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {BridgedUSDT} from "../../src/testnet/BridgedUSDT.sol";
import {WrappedCTC} from "../../src/testnet/WrappedCTC.sol";

contract WrappedCTCTest is Test {
    WrappedCTC internal wctc;
    address internal alice = makeAddr("alice");

    function setUp() public {
        wctc = new WrappedCTC();
        vm.deal(alice, 100 ether);
    }

    function test_depositMintsOneForOne() public {
        vm.prank(alice);
        wctc.deposit{value: 5 ether}();

        assertEq(wctc.balanceOf(alice), 5 ether);
        assertEq(address(wctc).balance, 5 ether);
    }

    function test_withdrawReturnsTheNativeValue() public {
        vm.startPrank(alice);
        wctc.deposit{value: 5 ether}();
        uint256 before = alice.balance;
        wctc.withdraw(2 ether);
        vm.stopPrank();

        assertEq(alice.balance, before + 2 ether);
        assertEq(wctc.balanceOf(alice), 3 ether);
    }

    /// A plain transfer should wrap rather than sit in the contract unclaimable.
    function test_plainTransferWraps() public {
        vm.prank(alice);
        (bool ok,) = address(wctc).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(wctc.balanceOf(alice), 1 ether);
    }

    function test_cannotWithdrawMoreThanHeld() public {
        vm.startPrank(alice);
        wctc.deposit{value: 1 ether}();
        vm.expectRevert(
            abi.encodeWithSelector(WrappedCTC.InsufficientBalance.selector, 1 ether, 2 ether)
        );
        wctc.withdraw(2 ether);
        vm.stopPrank();
    }

    function test_zeroIsRejectedBothWays() public {
        vm.startPrank(alice);
        vm.expectRevert(WrappedCTC.NothingToWrap.selector);
        wctc.deposit{value: 0}();
        vm.expectRevert(WrappedCTC.NothingToWrap.selector);
        wctc.withdraw(0);
        vm.stopPrank();
    }

    /// The only property that matters: every WCTC in existence is backed by
    /// native CTC held here. If these ever diverge, some holder cannot exit.
    function testFuzz_supplyAlwaysMatchesBackingValue(uint96[8] calldata moves) public {
        for (uint256 i = 0; i < moves.length; ++i) {
            uint256 amount = bound(moves[i], 0, 10 ether);
            if (i % 2 == 0) {
                if (amount == 0) continue;
                vm.deal(alice, amount);
                vm.prank(alice);
                wctc.deposit{value: amount}();
            } else {
                uint256 held = wctc.balanceOf(alice);
                if (held == 0 || amount == 0) continue;
                vm.prank(alice);
                wctc.withdraw(amount > held ? held : amount);
            }
            assertEq(wctc.totalSupply(), address(wctc).balance, "unbacked token in circulation");
        }
    }
}

contract BridgedUSDTTest is Test {
    BridgedUSDT internal usdt;
    address internal alice = makeAddr("alice");

    function setUp() public {
        usdt = new BridgedUSDT();
    }

    /// Six decimals, like the asset it stands in for. Treating it as eighteen
    /// is the mistake that values a thousand dollars at a trillionth of a cent.
    function test_hasSixDecimalsLikeTheRealAsset() public view {
        assertEq(usdt.decimals(), 6);
        assertEq(usdt.symbol(), "USDT.C");
    }

    function test_faucetMintsWholeTokens() public {
        vm.prank(alice);
        usdt.faucet(1_000);
        assertEq(usdt.balanceOf(alice), 1_000 * 1e6);
    }

    function test_faucetIsBounded() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(BridgedUSDT.OverFaucetLimit.selector, 100_001, 100_000)
        );
        usdt.faucet(100_001);
    }

    /// The open mint is what marks this as a stand-in: a genuinely bridged
    /// asset can only come into existence by bridging.
    function test_anyoneMayMint() public {
        vm.prank(makeAddr("stranger"));
        usdt.faucet(1);
        assertEq(usdt.totalSupply(), 1e6);
    }
}
