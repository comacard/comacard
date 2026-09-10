// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CreditScoring} from "../../src/libraries/CreditScoring.sol";
import {CreditAccount} from "../../src/types/CreditTypes.sol";

contract CreditScoringTest is Test {
    function _account(uint64 nonce, uint64 cycles, uint64 repays, uint256 collateral)
        internal
        pure
        returns (CreditAccount memory)
    {
        return CreditAccount({
            collateral: collateral,
            drawn: 0,
            pendingRelease: 0,
            drawnAt: 0,
            dueAt: 0,
            provenNonce: nonce,
            cycleCount: cycles,
            repayCount: repays,
            defaultCount: 0
        });
    }

    function test_strangerScoresZeroAndPaysTheWorstRatio() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);
        assertEq(CreditScoring.score(a), 0);
        assertEq(CreditScoring.collateralizationBps(0), 15_000);
        assertEq(CreditScoring.limitFrom(a.collateral, a), uint256(1 ether) * 10_000 / 15_000);
    }

    function test_spotlessRecordEarnsUndercollateralisation() public pure {
        CreditAccount memory a = _account(200, 10, 10, 1 ether);
        assertEq(CreditScoring.score(a), 100);
        assertEq(CreditScoring.collateralizationBps(100), 8_000);
        assertGt(CreditScoring.limitFrom(a.collateral, a), 1 ether);
    }

    /// The whole point of tracking defaults: they must actually cost something.
    function test_defaultsCostScoreAndBorrowingPower() public pure {
        CreditAccount memory clean = _account(200, 4, 4, 1 ether);
        CreditAccount memory defaulted = _account(200, 4, 2, 1 ether);

        assertGt(CreditScoring.score(clean), CreditScoring.score(defaulted));
        assertLt(CreditScoring.limitFrom(clean.collateral, clean), type(uint256).max);
        assertGt(
            CreditScoring.limitFrom(clean.collateral, clean),
            CreditScoring.limitFrom(defaulted.collateral, defaulted)
        );
    }

    /// External history alone must not unlock undercollateralised borrowing —
    /// a busy wallet that has never repaid anything here is still a stranger.
    function test_historyAloneCannotReachTheBestRatio() public pure {
        CreditAccount memory busy = _account(type(uint64).max, 0, 0, 1 ether);
        assertEq(CreditScoring.score(busy), 40);
        assertGt(CreditScoring.collateralizationBps(CreditScoring.score(busy)), 10_000);
        assertLt(CreditScoring.limitFrom(busy.collateral, busy), 1 ether);
    }

    /// Collateral and credit are different assets on different chains, so the
    /// library is handed a value rather than a balance. Passing the balance
    /// straight through — as the credit line used to — is the 1:1 assumption
    /// this signature exists to make visible.
    function test_priceScalesTheLimit() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);

        // A stranger posts 1 unit of collateral and pays 150% collateralisation.
        assertEq(CreditScoring.limitFrom(1 ether, a), uint256(1 ether) * 10_000 / 15_000);

        // Worth ten times as much in the credit asset, the same balance backs
        // ten times the credit. Integer division truncates, so this is exact
        // rather than a multiple of the smaller result.
        assertEq(CreditScoring.limitFrom(10 ether, a), uint256(10 ether) * 10_000 / 15_000);

        // Priced at zero, collateral backs nothing at all.
        assertEq(CreditScoring.limitFrom(0, a), 0);
    }

    function test_noCollateralMeansNoCredit() public pure {
        CreditAccount memory a = _account(200, 10, 10, 0);
        assertEq(CreditScoring.limitFrom(a.collateral, a), 0);
        assertEq(CreditScoring.availableFrom(a.collateral, a), 0);
    }

    function test_availableNeverUnderflowsWhenOverdrawn() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);
        a.drawn = 100 ether;
        assertEq(CreditScoring.availableFrom(a.collateral, a), 0);
    }

    function testFuzz_scoreStaysWithinBounds(
        uint64 nonce,
        uint64 cycles,
        uint64 repays,
        uint128 collateral
    ) public pure {
        assertLe(CreditScoring.score(_account(nonce, cycles, repays, collateral)), 100);
    }

    /// A better score must never demand more collateral.
    function testFuzz_ratioIsMonotonic(uint256 lower, uint256 higher) public pure {
        lower = bound(lower, 0, 100);
        higher = bound(higher, lower, 100);
        assertGe(
            CreditScoring.collateralizationBps(lower), CreditScoring.collateralizationBps(higher)
        );
    }

    /// Repaying can never lower a score; defaulting can never raise one.
    function testFuzz_repaymentNeverHurts(uint64 nonce, uint64 cycles, uint64 repays) public pure {
        cycles = uint64(bound(cycles, 1, 1000));
        repays = uint64(bound(repays, 0, cycles - 1));
        uint256 before = CreditScoring.score(_account(nonce, cycles, repays, 1 ether));
        uint256 afterRepay = CreditScoring.score(_account(nonce, cycles, repays + 1, 1 ether));
        assertGe(afterRepay, before);
    }
}
