// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {SourceVault} from "../../src/source/SourceVault.sol";
import {TestToken} from "../../src/testnet/TestToken.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {FeeToken} from "../helpers/FeeToken.sol";

contract SourceVaultTokensTest is Test {
    SourceVault internal vault;
    TestToken internal usdc;
    address internal governance;
    address internal operator;
    address internal alice = makeAddr("alice");

    function setUp() public {
        governance = makeAddr("governance");
        operator = makeAddr("operator");
        vault = Deployers.sourceVault(governance, operator);
        usdc = new TestToken("Test USDC", "tUSDC", 6);

        vm.prank(governance);
        vault.setSupportedToken(address(usdc), true);

        vm.startPrank(alice);
        usdc.faucet(10_000);
        usdc.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    function test_lockTokenHoldsItAndEmits() public {
        vm.expectEmit(true, true, false, true);
        emit SourceVault.TokenLocked(alice, address(usdc), 1_000e6, 0);
        vm.prank(alice);
        vault.lockToken(address(usdc), 1_000e6);

        assertEq(vault.tokenBalanceOf(alice, address(usdc)), 1_000e6);
        assertEq(usdc.balanceOf(address(vault)), 1_000e6);
    }

    function test_unsupportedTokenIsRefused() public {
        TestToken other = new TestToken("Other", "OTH", 18);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(SourceVault.TokenNotSupported.selector, address(other))
        );
        vault.lockToken(address(other), 1);
    }

    /// A fee-on-transfer token delivers less than was asked for. Crediting the
    /// request rather than the receipt would let a borrower claim collateral
    /// that never arrived.
    function test_feeOnTransferCreditsWhatArrived() public {
        FeeToken fee = new FeeToken();
        assertTrue(fee.transfer(alice, 1_000 ether));
        vm.prank(governance);
        vault.setSupportedToken(address(fee), true);

        vm.startPrank(alice);
        fee.approve(address(vault), type(uint256).max);
        vault.lockToken(address(fee), 100 ether);
        vm.stopPrank();

        // 10% skimmed in transit: 90 arrived, 90 credited
        assertEq(vault.tokenBalanceOf(alice, address(fee)), 90 ether);
    }

    function test_tokenUnlockNeedsOperatorRelease() public {
        vm.prank(alice);
        vault.lockToken(address(usdc), 1_000e6);

        vm.prank(alice);
        vm.expectRevert(CreditErrors.InsufficientCollateral.selector);
        vault.unlockToken(address(usdc), 1_000e6);

        vm.prank(operator);
        vault.approveTokenRelease(alice, address(usdc), 400e6);

        uint256 before = usdc.balanceOf(alice);
        vm.prank(alice);
        vault.unlockToken(address(usdc), 400e6);

        assertEq(usdc.balanceOf(alice), before + 400e6);
        assertEq(vault.tokenBalanceOf(alice, address(usdc)), 600e6);
    }

    function test_listingIsGovernanceOnly() public {
        vm.prank(operator);
        vm.expectRevert();
        vault.setSupportedToken(address(usdc), false);
    }

    /// Native ETH collateral must be untouched by the token path — the live
    /// vault already holds ETH, and an upgrade must not disturb it.
    function test_nativeAndTokenCollateralAreSeparate() public {
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        vault.lock{value: 1 ether}();
        vault.lockToken(address(usdc), 500e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(vault.tokenBalanceOf(alice, address(usdc)), 500e6);
    }

    function testFuzz_tokenWithdrawalNeverExceedsLocked(
        uint64 locked,
        uint64 approved,
        uint64 taken
    ) public {
        locked = uint64(bound(locked, 1, 10_000e6));
        approved = uint64(bound(approved, 0, locked));

        vm.prank(alice);
        vault.lockToken(address(usdc), locked);
        vm.prank(operator);
        vault.approveTokenRelease(alice, address(usdc), approved);

        vm.prank(alice);
        if (taken == 0 || taken > approved) {
            vm.expectRevert();
            vault.unlockToken(address(usdc), taken);
        } else {
            vault.unlockToken(address(usdc), taken);
        }
        assertLe(usdc.balanceOf(address(vault)), locked);
    }
}
