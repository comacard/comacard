// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Test} from "forge-std/Test.sol";

import {ASCCreditLine} from "../../src/creditcoin/ASCCreditLine.sol";
import {CtcStakingAdapter} from "../../src/creditcoin/CtcStakingAdapter.sol";
import {Governed} from "../../src/governance/Governed.sol";
import {IYieldAdapter} from "../../src/interfaces/IYieldAdapter.sol";
import {SourceVault} from "../../src/source/SourceVault.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";

/// @notice The governance split is the whole point of `Governed`, so it is
///         checked from every direction: a hot operator key must not be able to
///         change configuration, a guardian must not be able to restart the
///         system, and compliance must not be able to move money.
contract AccessControlTest is Test {
    ASCCreditLine internal line;
    CtcStakingAdapter internal adapter;
    SourceVault internal vault;

    address internal governance;
    address internal operator;
    address internal guardian = makeAddr("guardian");
    address internal compliance = makeAddr("compliance");
    address internal intruder = makeAddr("intruder");
    address internal alice = makeAddr("alice");

    // Cached: reading a role off the contract is an external call, and an
    // external call inside an expectRevert argument consumes the pending prank.
    bytes32 internal ADMIN;
    bytes32 internal OPERATOR;
    bytes32 internal GUARDIAN;
    bytes32 internal COMPLIANCE;

    function setUp() public {
        governance = makeAddr("governance");
        operator = makeAddr("operator");

        vault = Deployers.sourceVault(governance, operator);
        line = Deployers.creditLine(address(vault), 1, governance, operator);
        adapter = Deployers.stakingAdapter(
            address(line), governance, operator, makeAddr("stakingAccount")
        );

        ADMIN = line.DEFAULT_ADMIN_ROLE();
        OPERATOR = line.OPERATOR_ROLE();
        GUARDIAN = line.GUARDIAN_ROLE();
        COMPLIANCE = line.COMPLIANCE_ROLE();

        vm.startPrank(governance);
        line.grantRole(GUARDIAN, guardian);
        line.grantRole(COMPLIANCE, compliance);
        vault.grantRole(GUARDIAN, guardian);
        vault.grantRole(COMPLIANCE, compliance);
        vm.stopPrank();
    }

    function _denied(address caller, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, caller, role
        );
    }

    // ---------------- role boundaries ----------------

    function test_operatorCannotChangeConfiguration() public {
        vm.prank(operator);
        vm.expectRevert(_denied(operator, ADMIN));
        line.setYieldAdapter(IYieldAdapter(address(adapter)));
    }

    function test_operatorCannotPauseOrFreeze() public {
        vm.startPrank(operator);
        vm.expectRevert(_denied(operator, GUARDIAN));
        line.pause();

        vm.expectRevert(_denied(operator, COMPLIANCE));
        line.setFrozen(alice, true, "test");
        vm.stopPrank();
    }

    /// Halting must be easy; restarting must require governance.
    function test_guardianPausesButCannotUnpause() public {
        vm.prank(guardian);
        line.pause();
        assertTrue(line.paused());

        vm.prank(guardian);
        vm.expectRevert(_denied(guardian, ADMIN));
        line.unpause();

        vm.prank(governance);
        line.unpause();
        assertFalse(line.paused());
    }

    function test_guardianCannotMoveMoney() public {
        vm.prank(guardian);
        vm.expectRevert(_denied(guardian, OPERATOR));
        line.deployLiquidity(1 ether);
    }

    function test_complianceCanOnlyFreeze() public {
        vm.prank(compliance);
        line.setFrozen(alice, true, "sanctions screening hit");
        assertTrue(line.frozen(alice));

        vm.prank(compliance);
        vm.expectRevert(_denied(compliance, OPERATOR));
        line.deployLiquidity(1 ether);
    }

    function test_intruderHasNothing() public {
        vm.startPrank(intruder);
        vm.expectRevert(_denied(intruder, OPERATOR));
        line.deployLiquidity(1 ether);

        vm.expectRevert(_denied(intruder, GUARDIAN));
        line.pause();

        vm.expectRevert(_denied(intruder, COMPLIANCE));
        line.setFrozen(alice, true, "nope");

        vm.expectRevert(_denied(intruder, ADMIN));
        line.setYieldAdapter(IYieldAdapter(address(adapter)));
        vm.stopPrank();
    }

    function test_vaultAndAdapterEnforceOperatorRole() public {
        vm.startPrank(intruder);
        vm.expectRevert(_denied(intruder, OPERATOR));
        vault.approveRelease(intruder, 1 ether);

        vm.expectRevert(_denied(intruder, OPERATOR));
        adapter.delegate(1 ether);
        vm.stopPrank();
    }

    // ---------------- compliance behaviour ----------------

    /// A freeze stops movement without touching the balance: a compliance hold
    /// must never quietly become a seizure.
    function test_freezeBlocksLockButPreservesBalance() public {
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vault.lock{value: 1 ether}();

        vm.prank(compliance);
        vault.setFrozen(alice, true, "under review");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Governed.AccountIsFrozen.selector, alice));
        vault.lock{value: 1 ether}();

        assertEq(vault.balanceOf(alice), 1 ether, "balance survives the freeze");

        vm.prank(compliance);
        vault.setFrozen(alice, false, "cleared");
        vm.prank(alice);
        vault.lock{value: 1 ether}();
        assertEq(vault.balanceOf(alice), 2 ether);
    }

    function test_pauseHaltsValueMovement() public {
        vm.prank(guardian);
        vault.pause();

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert();
        vault.lock{value: 1 ether}();
    }

    // ---------------- upgrade authority ----------------

    function test_onlyGovernanceMayUpgrade() public {
        address newImpl = address(new ASCCreditLine());

        vm.prank(operator);
        vm.expectRevert(_denied(operator, ADMIN));
        line.upgradeToAndCall(newImpl, "");

        vm.prank(governance);
        line.upgradeToAndCall(newImpl, "");
    }

    function test_initializeCannotBeCalledTwice() public {
        vm.expectRevert();
        line.initialize(address(vault), 1, governance, operator, 3 days);
    }

    function test_initializerRejectsZeroSourceVault() public {
        ASCCreditLine impl = new ASCCreditLine();
        vm.expectRevert(CreditErrors.ZeroAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(ASCCreditLine.initialize, (address(0), 1, governance, operator, 3 days))
        );
    }

    function test_initializerRejectsZeroOperator() public {
        ASCCreditLine impl = new ASCCreditLine();
        vm.expectRevert(CreditErrors.ZeroAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                ASCCreditLine.initialize, (address(vault), 1, governance, address(0), 3 days)
            )
        );
    }
}
