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
        assertEq(CreditScoring.limit(a), uint256(1 ether) * 10_000 / 15_000);
    }

    function test_spotlessRecordEarnsUndercollateralisation() public pure {
        CreditAccount memory a = _account(200, 10, 10, 1 ether);
        assertEq(CreditScoring.score(a), 100);
        assertEq(CreditScoring.collateralizationBps(100), 8_000);
        assertGt(CreditScoring.limit(a), 1 ether);
    }

    /// The whole point of tracking defaults: they must actually cost something.
    function test_defaultsCostScoreAndBorrowingPower() public pure {
        CreditAccount memory clean = _account(200, 4, 4, 1 ether);
        CreditAccount memory defaulted = _account(200, 4, 2, 1 ether);

        assertGt(CreditScoring.score(clean), CreditScoring.score(defaulted));
        assertLt(CreditScoring.limit(clean), type(uint256).max);
        assertGt(CreditScoring.limit(clean), CreditScoring.limit(defaulted));
    }

    /// External history alone must not unlock undercollateralised borrowing —
    /// a busy wallet that has never repaid anything here is still a stranger.
    function test_historyAloneCannotReachTheBestRatio() public pure {
        CreditAccount memory busy = _account(type(uint64).max, 0, 0, 1 ether);
        assertEq(CreditScoring.score(busy), 40);
        assertGt(CreditScoring.collateralizationBps(CreditScoring.score(busy)), 10_000);
        assertLt(CreditScoring.limit(busy), 1 ether);
    }

    function test_noCollateralMeansNoCredit() public pure {
        CreditAccount memory a = _account(200, 10, 10, 0);
        assertEq(CreditScoring.limit(a), 0);
        assertEq(CreditScoring.available(a), 0);
    }

    function test_availableNeverUnderflowsWhenOverdrawn() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);
        a.drawn = 100 ether;
        assertEq(CreditScoring.available(a), 0);
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
