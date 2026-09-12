// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {VaultEvents} from "../../src/libraries/VaultEvents.sol";
import {CreditAction, CreditErrors} from "../../src/types/CreditTypes.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";

/// @notice Every route out of `_processAndEmitEvent`, taken through the
///         dispatch rather than around it.
///
/// @dev The rest of the suite calls `applyCollateral`, `applyTokenCollateral`
///     and `importHistory` directly on the harness, which tests what each one
///     does and never that the right one is reached. Until now `exposedProcess`
///     was called exactly once in the whole project, with action `9`, to check
///     the `UnknownAction` revert — so all five valid routes were untested.
///
///     That matters because the action ordinals are a wire format shared with
///     the worker. They have drifted once already: `historyImported` was 4 in
///     TypeScript and 2 in Solidity, which cost a mainnet proof that had been
///     generated and paid for. `packages/attestcoin` guards the language
///     boundary; this guards the Solidity side, so a reordered enum fails here
///     rather than crediting a token lock as a native one in production.
contract ActionDispatchTest is Test {
    CreditLineHarness internal line;
    address internal governance = makeAddr("governance");
    address internal operator = makeAddr("operator");
    address internal vault = makeAddr("sourceVault");
    address internal alice = makeAddr("alice");
    address internal token = makeAddr("tUSDC");

    uint256 internal constant ONE = 1e18;

    function setUp() public {
        line = Deployers.creditLineHarness(vault, 1, governance, operator);
        vm.prank(governance);
        line.listToken(token, 6, ONE);
    }

    function _nativeLog(bytes32 sig, uint256 amount, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        return TxFixtures.single(TxFixtures.logWithSignature(vault, sig, alice, amount));
    }

    function _tokenLog(bytes32 sig, uint256 amount, uint256 nonce)
        internal
        view
        returns (bytes memory)
    {
        return TxFixtures.single(TxFixtures.tokenLog(vault, sig, alice, token, amount, nonce));
    }

    // ----------------------------------------------------------------
    // The five routes
    // ----------------------------------------------------------------

    function test_collateralLockedRoutesToCollateral() public {
        line.exposedProcess(
            uint8(CreditAction.CollateralLocked),
            keccak256("q0"),
            _nativeLog(VaultEvents.COLLATERAL_LOCKED_SIG, 1 ether, 0)
        );
        assertEq(line.accountOf(alice).collateral, 1 ether);
    }

    function test_collateralUnlockedRoutesToCollateral() public {
        line.exposedProcess(
            uint8(CreditAction.CollateralLocked),
            keccak256("q1"),
            _nativeLog(VaultEvents.COLLATERAL_LOCKED_SIG, 1 ether, 0)
        );
        line.exposedProcess(
            uint8(CreditAction.CollateralUnlocked),
            keccak256("q2"),
            _nativeLog(VaultEvents.COLLATERAL_UNLOCKED_SIG, 0.4 ether, 1)
        );
        assertEq(line.accountOf(alice).collateral, 0.6 ether);
    }

    function test_historyImportedRoutesToHistory() public {
        line.exposedProcess(
            uint8(CreditAction.HistoryImported),
            keccak256("q3"),
            TxFixtures.historyTx(alice, 120, 1)
        );
        assertEq(line.accountOf(alice).provenNonce, 120);
    }

    function test_tokenLockedRoutesToTokenCollateral() public {
        line.exposedProcess(
            uint8(CreditAction.TokenLocked),
            keccak256("q4"),
            _tokenLog(VaultEvents.TOKEN_LOCKED_SIG, 500e6, 0)
        );
        assertEq(line.tokenCollateral(alice, token), 500e6);
    }

    function test_tokenUnlockedRoutesToTokenCollateral() public {
        line.exposedProcess(
            uint8(CreditAction.TokenLocked),
            keccak256("q5"),
            _tokenLog(VaultEvents.TOKEN_LOCKED_SIG, 500e6, 0)
        );
        line.exposedProcess(
            uint8(CreditAction.TokenUnlocked),
            keccak256("q6"),
            _tokenLog(VaultEvents.TOKEN_UNLOCKED_SIG, 200e6, 1)
        );
        assertEq(line.tokenCollateral(alice, token), 300e6);
    }

    function test_anUnknownActionIsRefused() public {
        bytes memory log = _nativeLog(VaultEvents.COLLATERAL_LOCKED_SIG, 1 ether, 0);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UnknownAction.selector, uint8(9)));
        line.exposedProcess(9, keccak256("q7"), log);
    }

    // ----------------------------------------------------------------
    // The ordinals themselves
    // ----------------------------------------------------------------

    /// The values, written out rather than derived, because deriving them from
    /// the enum would agree with any reordering.
    function test_theOrdinalsAreTheWireFormat() public pure {
        assertEq(uint8(CreditAction.CollateralLocked), 0);
        assertEq(uint8(CreditAction.CollateralUnlocked), 1);
        assertEq(uint8(CreditAction.HistoryImported), 2);
        assertEq(uint8(CreditAction.TokenLocked), 3);
        assertEq(uint8(CreditAction.TokenUnlocked), 4);
    }

    /// A reorder that kept the same set would leave every route test passing —
    /// each one would simply reach a different handler — so this pins that an
    /// action lands where its *name* says, not merely somewhere.
    function test_aTokenActionIsNotANativeOne() public {
        // Action 3 is TokenLocked. Handed a native lock log, the token handler
        // cannot read a token out of it and must refuse rather than credit.
        bytes memory nativeLog = _nativeLog(VaultEvents.COLLATERAL_LOCKED_SIG, 1 ether, 0);
        vm.expectRevert();
        line.exposedProcess(uint8(CreditAction.TokenLocked), keccak256("q8"), nativeLog);

        assertEq(line.accountOf(alice).collateral, 0);
        assertEq(line.tokenCollateral(alice, token), 0);
    }
}
