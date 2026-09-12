// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @notice The refusals — every guard clause that was never taken.
///
/// @dev Branch coverage on the credit line sat at 87% while lines sat at 97%,
///     and the gap was entirely arguments nobody had passed: a zero amount, a
///     zero address, an empty payment. None of them is interesting on its own.
///     Collectively they are the difference between "the happy path works" and
///     "the contract refuses what it says it refuses", and a guard that has
///     never been taken is a guard nobody has checked is wired up.
contract GuardsTest is Test {
    CreditLineHarness internal line;
    address internal governance = makeAddr("governance");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");
    address internal token = makeAddr("tUSDC");

    uint256 internal constant ONE = 1e18;

    function setUp() public {
        line = Deployers.creditLineHarness(makeAddr("sourceVault"), 1, governance, operator);
        vm.prank(governance);
        line.listToken(token, 6, ONE);
    }

    function test_fundingNothingIsRefused() public {
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.fund{value: 0}();
    }

    function test_repayingNothingIsRefused() public {
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.repay{value: 0}();
    }

    /// Distinct from repaying nothing: this one has no debt to repay.
    function test_repayingWithNoDebtIsRefused() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(CreditErrors.NothingOutstanding.selector);
        line.repay{value: 1 ether}();
    }

    function test_holdingNothingIsRefused() public {
        vm.prank(operator);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.placeReleaseHold(alice, 0);
    }

    function test_holdingNoTokensIsRefused() public {
        vm.prank(operator);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.placeTokenReleaseHold(alice, token, 0);
    }

    function test_listingTheZeroAddressIsRefused() public {
        vm.prank(governance);
        vm.expectRevert(CreditErrors.ZeroAddress.selector);
        line.listToken(address(0), 18, ONE);
    }

    function test_deployingNothingToYieldIsRefused() public {
        vm.prank(operator);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.deployLiquidity(0);
    }

    /// With no adapter set there is nothing to pull from, so a draw that the
    /// pool cannot cover has to fail as a liquidity problem rather than
    /// reverting somewhere inside a call to address zero.
    function test_drawingBeyondThePoolWithNoAdapterFails() public {
        line.seed(alice, 100 ether, 5, 5, 0);
        vm.deal(address(this), 1 ether);
        line.fund{value: 1 ether}();

        assertEq(address(line.yieldAdapter()), address(0));

        uint256 available = line.availableOf(alice);
        assertGt(available, 1 ether);

        vm.prank(alice);
        vm.expectRevert();
        line.draw(available);
    }

    function test_drawingNothingIsRefused() public {
        line.seed(alice, 10 ether, 1, 1, 0);
        vm.prank(alice);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        line.draw(0);
    }

    function test_repayingMoreThanIsOwedIsRefusedRatherThanRefunded() public {
        line.seed(alice, 100 ether, 5, 5, 0);
        vm.deal(address(this), 100 ether);
        line.fund{value: 100 ether}();

        vm.prank(alice);
        line.draw(10 ether);

        vm.deal(alice, 20 ether);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.RepaymentExceedsDebt.selector, 11 ether, 10 ether)
        );
        line.repay{value: 11 ether}();
    }
}
