// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CreditScoring} from "../../src/libraries/CreditScoring.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";

/// @notice The parts that make this a credit product rather than a vault: a
///         borrower's external record raising their limit, and a default
///         costing them one.
contract CreditLifecycleTest is Test {
    CreditLineHarness internal line;
    address internal governance;
    address internal operator;
    address internal vaultOnSource;
    address internal alice = makeAddr("alice");

    /// Cached deliberately: reading a role off the contract is an external
    /// call, and an external call anywhere in a pranked statement — including
    /// inside an argument — consumes the prank before it reaches its target.
    bytes32 internal GUARDIAN;

    uint64 internal constant MAINNET = 1;
    uint64 internal constant SEPOLIA = 11_155_111;

    function setUp() public {
        governance = makeAddr("governance");
        operator = makeAddr("operator");
        vaultOnSource = makeAddr("sourceVault");
        line = Deployers.creditLineHarness(vaultOnSource, 1, governance, operator);

        GUARDIAN = line.GUARDIAN_ROLE();

        vm.deal(address(this), 200 ether);
        line.fund{value: 100 ether}();
        vm.warp(1_800_000_000);
    }

    // ---------------- history import ----------------

    function test_provedMainnetActivityRaisesTheLimit() public {
        line.seed(alice, 1 ether, 0, 0, 0);
        uint256 before = line.limitOf(alice);

        line.importHistory(bytes32("h1"), TxFixtures.historyTx(alice, 200, MAINNET));

        assertEq(line.accountOf(alice).provenNonce, 200);
        assertGt(line.limitOf(alice), before);
    }

    /// The handler is never told which chain a proof came from, so the chain id
    /// signed into the transaction is what stops a cheap testnet nonce being
    /// passed off as mainnet history.
    function test_testnetHistoryIsRejected() public {
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.WrongChain.selector, MAINNET, SEPOLIA));
        line.importHistory(bytes32("h1"), TxFixtures.historyTx(alice, 5000, SEPOLIA));
    }

    /// A proof credits its own signer, so nobody can import someone else's past.
    function test_historyIsCreditedToTheSigner() public {
        address bob = makeAddr("bob");
        line.importHistory(bytes32("h1"), TxFixtures.historyTx(bob, 150, MAINNET));

        assertEq(line.accountOf(bob).provenNonce, 150);
        assertEq(line.accountOf(alice).provenNonce, 0);
    }

    function test_replayingOlderHistoryIsRejected() public {
        line.importHistory(bytes32("h1"), TxFixtures.historyTx(alice, 100, MAINNET));

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.StaleHistory.selector, 100, 40));
        line.importHistory(bytes32("h2"), TxFixtures.historyTx(alice, 40, MAINNET));

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.StaleHistory.selector, 100, 100));
        line.importHistory(bytes32("h3"), TxFixtures.historyTx(alice, 100, MAINNET));
    }

    // ---------------- defaults ----------------

    function _drawn(uint256 collateral) internal returns (uint256 amount) {
        line.seed(alice, collateral, 10, 10, 200);
        amount = line.availableOf(alice);
        vm.prank(alice);
        line.draw(amount);
    }

    function test_drawSetsADueDate() public {
        _drawn(1 ether);
        assertEq(line.accountOf(alice).dueAt, uint64(block.timestamp) + line.term());
        assertFalse(line.isOverdue(alice));
    }

    function test_cannotDefaultBeforeTheDueDate() public {
        _drawn(1 ether);
        uint64 dueAt = line.accountOf(alice).dueAt;

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.NotOverdue.selector, dueAt));
        line.markDefaulted(alice);

        vm.warp(dueAt);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.NotOverdue.selector, dueAt));
        line.markDefaulted(alice);
    }

    /// Anyone may call it: a debt everyone can see is overdue should not wait
    /// on a privileged key to be recognised as such.
    function test_defaultIsPermissionlessAndCostsTheBorrower() public {
        uint256 drawn = _drawn(1 ether);
        uint256 scoreBefore = line.scoreOf(alice);

        vm.warp(line.accountOf(alice).dueAt + 1);
        vm.prank(makeAddr("passer-by"));
        line.markDefaulted(alice);

        assertEq(line.accountOf(alice).drawn, 0);
        assertEq(line.totalDrawn(), 0);
        assertEq(line.accountOf(alice).defaultCount, 1);
        assertEq(line.accountOf(alice).cycleCount, 11);
        assertEq(line.accountOf(alice).repayCount, 10);
        assertLt(line.scoreOf(alice), scoreBefore, "a default must cost score");
        // written down by what was owed, capped at what was actually posted
        uint256 expected = drawn >= 1 ether ? 0 : 1 ether - drawn;
        assertEq(line.accountOf(alice).collateral, expected);
    }

    function test_defaultWriteDownIsCappedByCollateral() public {
        // undercollateralised: score 100 lets the draw exceed the collateral
        uint256 drawn = _drawn(1 ether);
        assertGt(drawn, 1 ether);

        vm.warp(line.accountOf(alice).dueAt + 1);
        line.markDefaulted(alice);

        assertEq(line.accountOf(alice).collateral, 0, "cannot seize more than was posted");
    }

    function test_defaultRequiresAnOutstandingBalance() public {
        vm.expectRevert(CreditErrors.NothingOutstanding.selector);
        line.markDefaulted(alice);
    }

    function test_repayingOnTimeClearsTheDueDate() public {
        uint256 drawn = _drawn(1 ether);
        vm.deal(alice, drawn);
        vm.prank(alice);
        line.repay{value: drawn}();

        assertEq(line.accountOf(alice).dueAt, 0);
        assertFalse(line.isOverdue(alice));
    }

    /// A defaulter must end up able to borrow less than a payer with the same
    /// collateral — otherwise the record dimension is decoration.
    function test_defaulterBorrowsLessThanAPayer() public {
        address bob = makeAddr("bob");
        line.seed(alice, 1 ether, 10, 10, 200);
        line.seed(bob, 1 ether, 10, 5, 200);
        assertGt(line.limitOf(alice), line.limitOf(bob));
    }

    // ---------------- term ----------------

    function test_termIsGovernanceOnlyAndBounded() public {
        vm.prank(governance);
        line.setTerm(60 days);
        assertEq(line.term(), 60 days);

        vm.prank(governance);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.TermOutOfRange.selector, uint64(1)));
        line.setTerm(1);

        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.TermOutOfRange.selector, uint64(400 days))
        );
        line.setTerm(400 days);
    }

    /// Outstanding debt must never exceed the limit, through any sequence of
    /// draws, repayments and defaults.
    function testFuzz_debtNeverExceedsLimit(uint96 collateral, uint96 amount, bool defaultIt)
        public
    {
        collateral = uint96(bound(collateral, 1, 10 ether));
        line.seed(alice, collateral, 10, 10, 200);

        uint256 avail = line.availableOf(alice);
        vm.assume(amount > 0 && amount <= avail);

        vm.prank(alice);
        line.draw(amount);
        assertLe(line.accountOf(alice).drawn, line.limitOf(alice));

        if (defaultIt) {
            vm.warp(line.accountOf(alice).dueAt + 1);
            line.markDefaulted(alice);
            assertEq(line.accountOf(alice).drawn, 0);
            assertLe(line.accountOf(alice).drawn, line.limitOf(alice));
        }
    }

    // ---------------- score farming ----------------

    /// Opening and closing cycles in a single block costs only gas. Without a
    /// minimum holding period a borrower could manufacture a spotless record
    /// for free, then post real collateral against the inflated limit.
    function test_instantRepaymentEarnsNoRecord() public {
        line.seed(alice, 1 ether, 0, 0, 0);

        for (uint256 i = 0; i < 5; ++i) {
            uint256 amount = line.availableOf(alice);
            vm.prank(alice);
            line.draw(amount);
            vm.deal(alice, amount);
            vm.prank(alice);
            line.repay{value: amount}();
        }

        assertEq(line.accountOf(alice).cycleCount, 0, "farmed cycles must not count");
        assertEq(line.accountOf(alice).repayCount, 0);
        assertEq(line.scoreOf(alice), 0);
    }

    function test_aCycleHeldLongEnoughDoesCount() public {
        line.seed(alice, 1 ether, 0, 0, 0);
        uint256 amount = line.availableOf(alice);

        vm.prank(alice);
        line.draw(amount);
        vm.warp(block.timestamp + line.minCycleDuration());
        vm.deal(alice, amount);
        vm.prank(alice);
        line.repay{value: amount}();

        assertEq(line.accountOf(alice).cycleCount, 1);
        assertEq(line.accountOf(alice).repayCount, 1);
        assertGt(line.scoreOf(alice), 0);
    }

    // ---------------- pause fairness ----------------

    /// A pause stops new borrowing. It must not trap a borrower with a debt
    /// they cannot clear while the clock keeps running toward default.
    function test_repayWorksWhilePaused() public {
        uint256 drawn = _drawn(1 ether);

        address guardian = makeAddr("guardian");
        vm.prank(governance);
        line.grantRole(GUARDIAN, guardian);
        vm.prank(guardian);
        line.pause();

        // borrowing is shut
        vm.prank(alice);
        vm.expectRevert();
        line.draw(1);

        // repaying is not
        vm.deal(alice, drawn);
        vm.prank(alice);
        line.repay{value: drawn}();
        assertEq(line.accountOf(alice).drawn, 0);
    }

    /// And nobody may be defaulted while the system is paused either.
    function test_noDefaultsWhilePaused() public {
        _drawn(1 ether);
        address guardian = makeAddr("guardian");
        vm.prank(governance);
        line.grantRole(GUARDIAN, guardian);
        vm.prank(guardian);
        line.pause();

        vm.warp(line.accountOf(alice).dueAt + 1);
        vm.expectRevert();
        line.markDefaulted(alice);
    }

    function test_minCycleDurationIsGovernanceOnlyAndBounded() public {
        vm.prank(governance);
        line.setMinCycleDuration(7 days);
        assertEq(line.minCycleDuration(), 7 days);

        vm.prank(governance);
        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.DurationOutOfRange.selector, uint64(60 days))
        );
        line.setMinCycleDuration(60 days);
    }
}
