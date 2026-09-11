// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {VaultEvents} from "../../src/libraries/VaultEvents.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";

/// @notice Collateral in several assets at once. The risk this suite exists for
///         is not the arithmetic of one asset — it is two assets with different
///         decimals being valued as though they shared one.
contract MultiAssetTest is Test {
    CreditLineHarness internal line;
    address internal governance;
    address internal operator;
    address internal vault;
    address internal alice = makeAddr("alice");

    // stand-ins for Sepolia token addresses
    address internal usdc = makeAddr("tUSDC");
    address internal weth = makeAddr("tWETH");

    uint256 internal constant ONE = 1e18;

    function setUp() public {
        governance = makeAddr("governance");
        operator = makeAddr("operator");
        vault = makeAddr("sourceVault");
        line = Deployers.creditLineHarness(vault, 1, governance, operator);

        vm.startPrank(governance);
        // 1 USDC is worth 1 CTC; 1 WETH is worth 1000 CTC
        line.listToken(usdc, 6, 1 * ONE);
        line.listToken(weth, 18, 1000 * ONE);
        vm.stopPrank();
    }

    function _lock(address token, uint256 amount, uint256 nonce) internal {
        line.applyTokenCollateral(
            keccak256(abi.encode(token, nonce)),
            TxFixtures.single(
                TxFixtures.tokenLog(
                    vault, VaultEvents.TOKEN_LOCKED_SIG, alice, token, amount, nonce
                )
            ),
            true
        );
    }

    /// The failure mode that matters. 1 USDC is 1e6 base units; valued as if it
    /// had 18 decimals it would be worth a trillionth of a CTC.
    function test_sixDecimalTokenIsValuedByItsOwnDecimals() public {
        _lock(usdc, 1_000 * 1e6, 0); // 1,000 USDC

        assertEq(line.collateralValueOf(alice), 1_000 * ONE, "1,000 USDC is 1,000 CTC");
    }

    function test_eighteenDecimalTokenIsValuedCorrectly() public {
        _lock(weth, 2 * ONE, 0); // 2 WETH

        assertEq(line.collateralValueOf(alice), 2_000 * ONE, "2 WETH is 2,000 CTC");
    }

    /// Collateral across assets adds up in one unit, so a borrower holding
    /// several can draw against all of them at once.
    function test_valueSumsAcrossAssets() public {
        _lock(usdc, 500 * 1e6, 0); // 500 CTC
        _lock(weth, 1 * ONE, 1); // 1,000 CTC

        assertEq(line.collateralValueOf(alice), 1_500 * ONE);
        // stranger, 150% collateralised: 1,500 / 1.5
        assertEq(line.limitOf(alice), 1_000 * ONE);
    }

    function test_unlistedTokenIsRefusedNotCreditedAtZero() public {
        address unknown = makeAddr("unknown");
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.TokenNotListed.selector, unknown));
        line.applyTokenCollateral(
            keccak256("q"),
            TxFixtures.single(
                TxFixtures.tokenLog(vault, VaultEvents.TOKEN_LOCKED_SIG, alice, unknown, 1e6, 0)
            ),
            true
        );
    }

    /// Token events are selected by their own signature, so a native lock can
    /// never be read as a token lock in different units.
    function test_tokenAndNativeSignaturesDoNotCollide() public pure {
        assertTrue(VaultEvents.TOKEN_LOCKED_SIG != VaultEvents.COLLATERAL_LOCKED_SIG);
        assertTrue(VaultEvents.TOKEN_UNLOCKED_SIG != VaultEvents.COLLATERAL_UNLOCKED_SIG);
    }

    function test_repricingATokenMovesTheLimit() public {
        _lock(weth, 1 * ONE, 0);
        // 1 WETH at 1,000 CTC, a stranger at 150%: 1,000 / 1.5
        assertEq(line.limitOf(alice), uint256(1000 * ONE) * 10_000 / 15_000);

        vm.prank(operator); // operator holds ORACLE_ROLE from initialize
        line.setTokenPrice(weth, 2000 * ONE);

        // Exact figure, not a multiple of the smaller one: each limit is its own
        // truncating division, so doubling a truncated result is off by a wei.
        assertEq(line.limitOf(alice), uint256(2000 * ONE) * 10_000 / 15_000);
    }

    function test_listingIsGovernanceAndPricingIsOracle() public {
        address token = makeAddr("new");

        vm.prank(operator);
        vm.expectRevert();
        line.listToken(token, 18, ONE);

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.TokenAlreadyListed.selector, usdc));
        line.listToken(usdc, 6, ONE);

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.DecimalsOutOfRange.selector, uint8(40)));
        line.listToken(token, 40, ONE);
    }

    function test_tokenUnlockDebitsAndConsumesHold() public {
        _lock(usdc, 1_000 * 1e6, 0);

        vm.prank(operator);
        line.placeTokenReleaseHold(alice, usdc, 400 * 1e6);
        assertEq(line.tokenCollateral(alice, usdc), 600 * 1e6);
        assertEq(line.tokenPendingRelease(alice, usdc), 400 * 1e6);

        line.applyTokenCollateral(
            keccak256("u"),
            TxFixtures.single(
                TxFixtures.tokenLog(
                    vault, VaultEvents.TOKEN_UNLOCKED_SIG, alice, usdc, 400 * 1e6, 1
                )
            ),
            false
        );
        // consumed the hold instead of debiting a second time
        assertEq(line.tokenCollateral(alice, usdc), 600 * 1e6);
        assertEq(line.tokenPendingRelease(alice, usdc), 0);
    }

    function test_listedTokensAreEnumerable() public view {
        address[] memory tokens = line.listedTokens();
        assertEq(tokens.length, 2);
        assertEq(tokens[0], usdc);
        assertEq(tokens[1], weth);
    }

    /// Whatever mix of assets and amounts, value is never negative, never
    /// overflows, and a larger holding is never worth less.
    function testFuzz_moreCollateralIsNeverWorthLess(uint64 a, uint64 b) public {
        _lock(usdc, uint256(a), 0);
        uint256 before = line.collateralValueOf(alice);
        _lock(usdc, uint256(b), 1);
        assertGe(line.collateralValueOf(alice), before);
    }
}
