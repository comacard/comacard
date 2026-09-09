// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CreditScoring} from "../../src/libraries/CreditScoring.sol";
import {CreditAccount} from "../../src/types/CreditTypes.sol";

contract CreditScoringTest is Test {
    uint256 constant NOW = 1_800_000_000;

    function _account(uint64 firstSeenAt, uint64 borrows, uint64 repays, uint256 collateral)
        internal
        pure
        returns (CreditAccount memory)
    {
        return CreditAccount({
            collateral: collateral,
            drawn: 0,
            borrowCount: borrows,
            repayCount: repays,
            firstSeenAt: firstSeenAt
        });
    }

    function test_freshAccountScoresZeroAndPaysTheWorstRatio() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);
        assertEq(CreditScoring.score(a, NOW), 0);
        assertEq(CreditScoring.collateralizationBps(0), 15_000);
        // 150% collateralisation: two thirds of what was locked
        assertEq(CreditScoring.limit(a, NOW), uint256(1 ether) * 10_000 / 15_000);
    }

    function test_spotlessRecordEarnsUndercollateralisation() public pure {
        CreditAccount memory a = _account(uint64(NOW - 730 days), 10, 10, 1 ether);
        assertEq(CreditScoring.score(a, NOW), 100);
        assertEq(CreditScoring.collateralizationBps(100), 8_000);
        // 80% collateralisation: borrows more than it locked
        assertGt(CreditScoring.limit(a, NOW), 1 ether);
    }

    function test_defaultsDragTheScoreDown() public pure {
        uint64 seen = uint64(NOW - 365 days);
        uint256 clean = CreditScoring.score(_account(seen, 4, 4, 1 ether), NOW);
        uint256 dirty = CreditScoring.score(_account(seen, 4, 1, 1 ether), NOW);
        assertGt(clean, dirty);
    }

    function test_noCollateralMeansNoCredit() public pure {
        CreditAccount memory a = _account(uint64(NOW - 730 days), 10, 10, 0);
        assertEq(CreditScoring.limit(a, NOW), 0);
        assertEq(CreditScoring.available(a, NOW), 0);
    }

    function test_availableNeverUnderflowsWhenOverdrawn() public pure {
        CreditAccount memory a = _account(0, 0, 0, 1 ether);
        a.drawn = 100 ether;
        assertEq(CreditScoring.available(a, NOW), 0);
    }

    /// The score is a percentage; nothing may push it outside 0..100.
    function testFuzz_scoreStaysWithinBounds(
        uint64 age,
        uint64 borrows,
        uint64 repays,
        uint128 collateral
    ) public pure {
        age = uint64(bound(age, 0, 20 * 365 days));
        CreditAccount memory a = _account(uint64(NOW - age), borrows, repays, collateral);
        uint256 s = CreditScoring.score(a, NOW);
        assertLe(s, 100);
    }

    /// A better score must never demand more collateral.
    function testFuzz_ratioIsMonotonic(uint256 lower, uint256 higher) public pure {
        lower = bound(lower, 0, 100);
        higher = bound(higher, lower, 100);
        assertGe(
            CreditScoring.collateralizationBps(lower), CreditScoring.collateralizationBps(higher)
        );
    }
}
