// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {CtcStakingAdapter} from "../../src/creditcoin/CtcStakingAdapter.sol";
import {CreditScoring} from "../../src/libraries/CreditScoring.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {VaultEvents} from "../../src/libraries/VaultEvents.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";
import {IYieldAdapter} from "../../src/interfaces/IYieldAdapter.sol";
import {ReentrantAdapter} from "../helpers/ReentrantAdapter.sol";
import {Deployers} from "../helpers/Deployers.sol";

contract ASCCreditLineTest is Test {
    CreditLineHarness internal line;
    address internal operator;
    address internal governance;
    address internal vaultOnSource;
    address internal alice = address(0xA11CE);

    function setUp() public {
        operator = makeAddr("operator");
        vaultOnSource = makeAddr("sourceVault");
        governance = makeAddr("governance");
        line = Deployers.creditLineHarness(vaultOnSource, 1, governance, operator);

        // seed the lending pool
        vm.deal(address(this), 100 ether);
        line.fund{value: 50 ether}();
        vm.warp(1_800_000_000);
    }

    function _fundedAlice(uint256 collateral) internal {
        line.seed(alice, collateral, 10, 10, 200);
    }

    function test_drawRespectsTheLimit() public {
        _fundedAlice(1 ether);
        uint256 available = line.availableOf(alice);
        assertGt(available, 1 ether); // score 100 earns undercollateralisation

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreditErrors.ExceedsAvailableCredit.selector, available + 1, available
            )
        );
        line.draw(available + 1);
    }

    function test_drawTransfersAndRecordsDebt() public {
        _fundedAlice(1 ether);
        uint256 before = alice.balance;

        vm.prank(alice);
        line.draw(1 ether);

        assertEq(alice.balance, before + 1 ether);
        assertEq(line.accountOf(alice).drawn, 1 ether);
        assertEq(line.totalDrawn(), 1 ether);
        assertEq(line.accountOf(alice).cycleCount, 10);
    }

    function test_repayClearsDebtAndCountsOnlyWhenSettled() public {
        _fundedAlice(1 ether);
        vm.prank(alice);
        line.draw(1 ether);
        vm.deal(alice, 1 ether);

        // hold the cycle long enough for it to count as a real one
        vm.warp(block.timestamp + 2 days);

        // a partial repayment reduces debt but earns no mark on the record
        vm.prank(alice);
        line.repay{value: 0.4 ether}();
        assertEq(line.accountOf(alice).drawn, 0.6 ether);
        assertEq(line.accountOf(alice).repayCount, 10);

        vm.prank(alice);
        line.repay{value: 0.6 ether}();
        assertEq(line.accountOf(alice).drawn, 0);
        assertEq(line.accountOf(alice).repayCount, 11);
        assertEq(line.accountOf(alice).cycleCount, 11);
        assertEq(line.totalDrawn(), 0);
    }

    function test_repayCannotExceedDebt() public {
        _fundedAlice(1 ether);
        vm.prank(alice);
        line.draw(1 ether);
        vm.deal(alice, 5 ether);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.RepaymentExceedsDebt.selector, 2 ether, 1 ether)
        );
        line.repay{value: 2 ether}();
    }

    function test_repayWithNothingOutstandingReverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(CreditErrors.NothingOutstanding.selector);
        line.repay{value: 1 ether}();
    }

    function test_noCollateralMeansNoDraw() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.ExceedsAvailableCredit.selector, 1 ether, 0)
        );
        line.draw(1 ether);
    }

    /// A draw must pull liquidity back out of the yield adapter when the
    /// operating buffer alone cannot cover it.
    function test_drawRecallsLiquidityFromAdapter() public {
        CtcStakingAdapter adapter = Deployers.stakingAdapter(
            address(line), governance, operator, makeAddr("stakingAccount")
        );
        vm.prank(governance);
        line.setYieldAdapter(adapter);
        vm.prank(operator);
        line.deployLiquidity(49 ether); // leave only 1 ether on hand

        assertEq(address(line).balance, 1 ether);
        _fundedAlice(5 ether);

        vm.prank(alice);
        line.draw(3 ether);

        assertEq(line.accountOf(alice).drawn, 3 ether);
        assertLt(adapter.idleBalance(), 49 ether);
    }

    /// Nobody may draw more than their limit, whatever the sequence.
    function testFuzz_outstandingNeverExceedsLimit(uint96 collateral, uint96 amount) public {
        collateral = uint96(bound(collateral, 1, 10 ether));
        _fundedAlice(collateral);

        uint256 available = line.availableOf(alice);
        vm.prank(alice);
        if (amount == 0 || amount > available) {
            vm.expectRevert();
            line.draw(amount);
        } else {
            line.draw(amount);
            assertLe(line.accountOf(alice).drawn, line.limitOf(alice));
        }
    }

    // ----------------------------------------------------------------
    // Collateral applied from proved source-chain events
    // ----------------------------------------------------------------

    function test_provedLockCreditsCollateral() public {
        bytes memory encoded =
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 3 ether, 0));

        line.applyCollateral(bytes32("q1"), encoded, true);

        assertEq(line.accountOf(alice).collateral, 3 ether);
    }

    function test_repeatedLocksAccumulate() public {
        line.applyCollateral(
            bytes32("q1"),
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 1 ether, 0)),
            true
        );
        line.applyCollateral(
            bytes32("q2"),
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 1 ether, 1)),
            true
        );
        assertEq(line.accountOf(alice).collateral, 2 ether);
    }

    function test_provedUnlockDebitsCollateral() public {
        line.applyCollateral(
            bytes32("q1"),
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 3 ether, 0)),
            true
        );
        line.applyCollateral(
            bytes32("q2"),
            TxFixtures.single(
                TxFixtures.logWithSignature(
                    vaultOnSource, VaultEvents.COLLATERAL_UNLOCKED_SIG, alice, 1 ether
                )
            ),
            false
        );
        assertEq(line.accountOf(alice).collateral, 2 ether);
    }

    function test_unlockCannotExceedRecordedCollateral() public {
        line.applyCollateral(
            bytes32("q1"),
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 1 ether, 0)),
            true
        );
        vm.expectRevert(CreditErrors.InsufficientCollateral.selector);
        line.applyCollateral(
            bytes32("q2"),
            TxFixtures.single(
                TxFixtures.logWithSignature(
                    vaultOnSource, VaultEvents.COLLATERAL_UNLOCKED_SIG, alice, 5 ether
                )
            ),
            false
        );
    }

    /// Collateral must not be releasable out from under an open debt.
    function test_unlockBlockedWhileDebtWouldBeStranded() public {
        _fundedAlice(2 ether);

        // resolve the limit before pranking: vm.prank applies to the next call,
        // and an inline availableOf() would consume it instead of draw()
        uint256 toDraw = line.availableOf(alice);
        vm.prank(alice);
        line.draw(toDraw);

        vm.expectRevert();
        line.applyCollateral(
            bytes32("q2"),
            TxFixtures.single(
                TxFixtures.logWithSignature(
                    vaultOnSource, VaultEvents.COLLATERAL_UNLOCKED_SIG, alice, 2 ether
                )
            ),
            false
        );
    }

    function test_impostorVaultCannotMintCollateral() public {
        address impostor = makeAddr("impostor");
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UntrustedEmitter.selector, impostor));
        line.applyCollateral(
            bytes32("q1"),
            TxFixtures.single(TxFixtures.collateralLog(impostor, alice, 1000 ether, 0)),
            true
        );
    }

    function test_unknownActionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UnknownAction.selector, uint8(9)));
        line.exposedProcess(9, bytes32("q"), bytes(""));
    }

    /// A yield adapter is operator-configured, but a compromised one must not
    /// be able to re-enter draw and take twice against a single limit.
    function test_hostileAdapterCannotReenterDraw() public {
        ReentrantAdapter hostile = new ReentrantAdapter(address(line));
        vm.prank(governance);
        line.setYieldAdapter(IYieldAdapter(address(hostile)));
        vm.prank(operator);
        line.deployLiquidity(49 ether);

        _fundedAlice(5 ether);
        hostile.arm(1 ether);

        vm.prank(alice);
        vm.expectRevert();
        line.draw(3 ether);
    }
}
