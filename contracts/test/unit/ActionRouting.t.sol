// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {TxFixtures} from "../helpers/TxFixtures.sol";
import {VaultEvents} from "../../src/libraries/VaultEvents.sol";
import {CreditAction, CreditErrors} from "../../src/types/CreditTypes.sol";

/// @title ActionRouting
/// @notice That each `action` byte reaches the handler it names.
///
/// @dev The rest of the suite reaches the handlers directly — `applyCollateral`,
///      `applyTokenCollateral`, `importHistory` — which tests what each one
///      does and never that the right one runs. Before this file the only
///      branch of `_processAndEmitEvent` ever executed was its `else`, reached
///      with action `9` to check `UnknownAction`. All five real routes were
///      untested.
///
///      That gap is not academic. The ordinals are a wire contract with the
///      off-chain worker, held in two hand-maintained lists in two languages:
///      `CreditAction` here and `ASC_ACTION` in `packages/attestcoin`. Nothing
///      enforces that they agree. Reorder either and every other test in this
///      repository still passes, while production credits a token lock as a
///      native one and misprices it by the token's decimals.
///
///      Each test therefore asserts on an effect only its own handler can
///      produce, so a route landing in the wrong handler cannot look like a
///      pass. The ordinals are pinned literally at the end, because a test that
///      reads the enum to check the enum proves nothing.
contract ActionRoutingTest is Test {
    CreditLineHarness internal line;
    address internal vaultOnSource;
    address internal governance;
    address internal alice = address(0xA11CE);
    address internal token = address(0x7053E9);

    function setUp() public {
        vaultOnSource = makeAddr("sourceVault");
        governance = makeAddr("governance");
        line = Deployers.creditLineHarness(vaultOnSource, 1, governance, makeAddr("operator"));
        vm.deal(address(this), 100 ether);
        line.fund{value: 50 ether}();
        // Listing is a governance call: which assets back credit is not the operator's decision.
        vm.prank(governance);
        line.listToken(token, 6, 1 ether);
        vm.warp(1_800_000_000);
    }

    function _process(CreditAction action, bytes memory encodedTx) internal {
        line.exposedProcess(uint8(action), keccak256(abi.encode(action, encodedTx)), encodedTx);
    }

    // ------------------------------------------------------------------
    // One test per route, each asserting something only its handler can do
    // ------------------------------------------------------------------

    function test_collateralLockedRoutesToNativeCollateral() public {
        _process(
            CreditAction.CollateralLocked,
            TxFixtures.single(TxFixtures.collateralLog(vaultOnSource, alice, 3 ether, 0))
        );

        assertEq(line.accountOf(alice).collateral, 3 ether, "native collateral not credited");
        // The token handler would have credited this instead, and silently.
        assertEq(line.tokenCollateral(alice, token), 0, "landed in the token handler");
    }

    function test_collateralUnlockedRoutesToNativeCollateral() public {
        line.seed(alice, 3 ether, 0, 0, 0);

        // `collateralLog` emits the LOCKED signature, so the unlock route needs its own. The
        // handler matches on the signature, not on the action byte it was routed by, and that
        // second check is what stops a mislabelled proof from crediting where it should debit.
        _process(
            CreditAction.CollateralUnlocked,
            TxFixtures.single(
                TxFixtures.logWithSignature(
                    vaultOnSource, VaultEvents.COLLATERAL_UNLOCKED_SIG, alice, 1 ether
                )
            )
        );

        // Debited, not credited: proof the unlock route is not the lock route.
        assertEq(line.accountOf(alice).collateral, 2 ether, "unlock did not debit");
    }

    function test_historyImportedRoutesToHistory() public {
        _process(CreditAction.HistoryImported, TxFixtures.historyTx(alice, 77, 1));

        assertEq(line.accountOf(alice).provenNonce, 77, "nonce not imported");
        // A collateral handler handed a history transaction finds no matching log and reverts, so
        // reaching this line at all says the dispatch was right.
        assertEq(line.accountOf(alice).collateral, 0, "history moved collateral");
    }

    function test_tokenLockedRoutesToTokenCollateral() public {
        _process(
            CreditAction.TokenLocked,
            TxFixtures.single(
                TxFixtures.tokenLog(vaultOnSource, VaultEvents.TOKEN_LOCKED_SIG, alice, token, 5e6, 0)
            )
        );

        assertEq(line.tokenCollateral(alice, token), 5e6, "token collateral not credited");
        // The native handler would have read 5e6 as 5e6 wei of ETH: the same number, a different
        // asset, and a limit out by twelve orders of magnitude.
        assertEq(line.accountOf(alice).collateral, 0, "landed in the native handler");
    }

    function test_tokenUnlockedRoutesToTokenCollateral() public {
        _process(
            CreditAction.TokenLocked,
            TxFixtures.single(
                TxFixtures.tokenLog(vaultOnSource, VaultEvents.TOKEN_LOCKED_SIG, alice, token, 5e6, 0)
            )
        );

        _process(
            CreditAction.TokenUnlocked,
            TxFixtures.single(
                TxFixtures.tokenLog(vaultOnSource, VaultEvents.TOKEN_UNLOCKED_SIG, alice, token, 2e6, 1)
            )
        );

        assertEq(line.tokenCollateral(alice, token), 3e6, "token unlock did not debit");
    }

    function test_unknownActionReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.UnknownAction.selector, uint8(9)));
        line.exposedProcess(9, keccak256("q"), bytes(""));
    }

    // ------------------------------------------------------------------
    // The wire contract with the off-chain worker
    // ------------------------------------------------------------------

    /// @notice The ordinals the worker sends, written out rather than derived.
    /// @dev Deliberately literal. `assertEq(uint8(CreditAction.TokenLocked), uint8(CreditAction.TokenLocked))`
    ///      is a tautology that survives any reordering; these numbers are the
    ///      ones in `packages/attestcoin/src/types.ts`, and this test fails the
    ///      moment the two stop agreeing.
    function test_actionOrdinalsMatchTheWorkersAbi() public pure {
        assertEq(uint8(CreditAction.CollateralLocked), 0, "collateralLocked moved");
        assertEq(uint8(CreditAction.CollateralUnlocked), 1, "collateralUnlocked moved");
        assertEq(uint8(CreditAction.HistoryImported), 2, "historyImported moved");
        assertEq(uint8(CreditAction.TokenLocked), 3, "tokenLocked moved");
        assertEq(uint8(CreditAction.TokenUnlocked), 4, "tokenUnlocked moved");
    }
}
