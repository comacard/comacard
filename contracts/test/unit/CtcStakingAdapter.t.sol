// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {Deployers} from "../helpers/Deployers.sol";

import {CtcStakingAdapter} from "../../src/creditcoin/CtcStakingAdapter.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";

/// @dev Stands in for the credit line: able to deposit, withdraw and receive.
contract CreditLineStub {
    CtcStakingAdapter internal adapter;

    function attach(CtcStakingAdapter a) external {
        adapter = a;
    }

    function deposit(uint256 amount) external {
        adapter.deposit{value: amount}();
    }

    function withdraw(uint256 amount) external returns (uint256) {
        return adapter.withdraw(amount);
    }

    receive() external payable {}
}

contract CtcStakingAdapterTest is Test {
    CtcStakingAdapter internal adapter;
    CreditLineStub internal creditLine;
    address internal operator;
    address internal stakingAccount;

    function setUp() public {
        operator = makeAddr("operator");
        stakingAccount = makeAddr("stakingAccount");
        creditLine = new CreditLineStub();
        adapter = Deployers.stakingAdapter(
            address(creditLine), makeAddr("governance"), operator, stakingAccount
        );
        creditLine.attach(adapter);
        vm.deal(address(creditLine), 100 ether);
    }

    function test_onlyTheCreditLineMayDeposit() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.Unauthorized.selector, address(this)));
        adapter.deposit{value: 1 ether}();
    }

    function test_depositThenDelegateMovesFundsToStakingAccount() public {
        creditLine.deposit(10 ether);
        assertEq(adapter.idleBalance(), 10 ether);

        vm.prank(operator);
        adapter.delegate(6 ether);

        assertEq(stakingAccount.balance, 6 ether);
        assertEq(adapter.deployedPrincipal(), 6 ether);
        assertEq(adapter.idleBalance(), 4 ether);
        // total assets survive the move — nothing is lost, only relocated
        assertEq(adapter.totalAssets(), 10 ether);
    }

    function test_delegateCannotExceedIdle() public {
        creditLine.deposit(1 ether);
        vm.prank(operator);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.InsufficientLiquidity.selector, 2 ether, 1 ether)
        );
        adapter.delegate(2 ether);
    }

    /// Bonded CTC is subject to an unbonding period, so a withdrawal can only
    /// return what is idle. The caller must be told how much it actually got.
    function test_withdrawIsCappedByIdleLiquidity() public {
        creditLine.deposit(10 ether);
        vm.prank(operator);
        adapter.delegate(9 ether);

        uint256 got = creditLine.withdraw(5 ether);
        assertEq(got, 1 ether);
        assertEq(adapter.idleBalance(), 0);
    }

    function test_returnedPrincipalAboveDebtCountsAsRewards() public {
        creditLine.deposit(10 ether);
        vm.prank(operator);
        adapter.delegate(10 ether);

        vm.deal(operator, 11 ether);
        vm.prank(operator);
        adapter.returnPrincipal{value: 11 ether}();

        assertEq(adapter.deployedPrincipal(), 0);
        assertEq(adapter.accruedRewards(), 1 ether);
        assertEq(adapter.idleBalance(), 11 ether);
    }

    function test_rewardsAreReportedSeparately() public {
        vm.deal(operator, 2 ether);
        vm.prank(operator);
        adapter.reportRewards{value: 2 ether}();
        assertEq(adapter.accruedRewards(), 2 ether);
        assertEq(adapter.idleBalance(), 2 ether);
    }

    function test_onlyOperatorMayDelegate() public {
        bytes32 operatorRole = adapter.OPERATOR_ROLE();
        creditLine.deposit(1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                address(this),
                operatorRole
            )
        );
        adapter.delegate(1 ether);
    }

    /// Everything handed to the adapter is either idle or accounted as deployed.
    function testFuzz_nothingGoesMissing(uint96 deposited, uint96 delegated) public {
        deposited = uint96(bound(deposited, 1, 100 ether));
        delegated = uint96(bound(delegated, 0, deposited));
        vm.deal(address(creditLine), deposited);

        creditLine.deposit(deposited);
        if (delegated > 0) {
            vm.prank(operator);
            adapter.delegate(delegated);
        }
        assertEq(adapter.totalAssets(), deposited);
    }

    function test_withdrawRevertsWhenNothingIsIdle() public {
        creditLine.deposit(5 ether);
        vm.prank(operator);
        adapter.delegate(5 ether);

        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.InsufficientLiquidity.selector, 1 ether, 0)
        );
        creditLine.withdraw(1 ether);
    }

    function test_delegateRequiresAStakingAccount() public {
        creditLine.deposit(1 ether);
        vm.prank(operator);
        adapter.setStakingAccount(address(0));

        vm.prank(operator);
        vm.expectRevert(CreditErrors.ZeroAddress.selector);
        adapter.delegate(1 ether);
    }

    function test_stakingAccountCanBeRepointed() public {
        address next = makeAddr("nextValidator");
        vm.prank(operator);
        adapter.setStakingAccount(next);
        assertEq(adapter.stakingAccount(), next);

        creditLine.deposit(2 ether);
        vm.prank(operator);
        adapter.delegate(2 ether);
        assertEq(next.balance, 2 ether);
    }

    /// A partial return must reduce the outstanding principal, not clear it.
    function test_partialPrincipalReturnLeavesTheRestOutstanding() public {
        creditLine.deposit(10 ether);
        vm.prank(operator);
        adapter.delegate(10 ether);

        vm.deal(operator, 4 ether);
        vm.prank(operator);
        adapter.returnPrincipal{value: 4 ether}();

        assertEq(adapter.deployedPrincipal(), 6 ether);
        assertEq(adapter.accruedRewards(), 0, "a partial return is not a reward");
        assertEq(adapter.totalAssets(), 10 ether);
    }

    function test_zeroValueOperationsAreRejected() public {
        vm.startPrank(operator);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        adapter.delegate(0);

        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        adapter.returnPrincipal{value: 0}();

        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        adapter.reportRewards{value: 0}();
        vm.stopPrank();

        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        creditLine.deposit(0);

        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        creditLine.withdraw(0);
    }

    /// Whatever the operator does with it, the adapter's own books must always
    /// add up: idle plus outstanding principal equals everything it was given.
    function testFuzz_booksAlwaysBalance(uint96 deposited, uint96 delegated, uint96 returned)
        public
    {
        deposited = uint96(bound(deposited, 1, 100 ether));
        delegated = uint96(bound(delegated, 0, deposited));
        returned = uint96(bound(returned, 0, delegated));

        vm.deal(address(creditLine), deposited);
        creditLine.deposit(deposited);

        if (delegated > 0) {
            vm.prank(operator);
            adapter.delegate(delegated);
        }
        if (returned > 0) {
            vm.deal(operator, returned);
            vm.prank(operator);
            adapter.returnPrincipal{value: returned}();
        }

        assertEq(adapter.idleBalance() + adapter.deployedPrincipal(), uint256(deposited));
    }
}
