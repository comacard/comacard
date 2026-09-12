// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CollateralMessage} from "../../src/libraries/CollateralMessage.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {ReleaseRelay} from "../../src/wormhole/ReleaseRelay.sol";
import {WormholeCollateralHub} from "../../src/wormhole/WormholeCollateralHub.sol";
import {WormholeVault} from "../../src/wormhole/WormholeVault.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {MockWormhole} from "../helpers/MockWormhole.sol";

/// @notice Collateral going home, without an operator deciding it may.
///
/// @dev The deposit path's risk is crediting collateral nobody posted. This
///      path's risk is the mirror image: letting collateral leave against a
///      debt that is still outstanding, or letting anyone but Creditcoin say so.
contract WormholeReleaseTest is Test {
    uint16 internal constant BASE_SEPOLIA = 10_004;
    uint16 internal constant CREDITCOIN = 59;
    uint256 internal constant ONE = 1e18;

    CreditLineHarness internal line;
    WormholeCollateralHub internal hub;
    MockWormhole internal core; // Creditcoin's
    MockWormhole internal remoteCore; // Base Sepolia's
    WormholeVault internal vault;
    ReleaseRelay internal relay;

    address internal governance = makeAddr("governance");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");

    bytes32 internal peer;
    bytes32 internal hubId;
    bytes32 internal nativeAsset;

    function setUp() public {
        line = Deployers.creditLineHarness(makeAddr("sourceVault"), 1, governance, operator);
        core = new MockWormhole(CREDITCOIN, 0);
        remoteCore = new MockWormhole(BASE_SEPOLIA, 0);

        vault = new WormholeVault(address(remoteCore), governance, operator);
        hub = Deployers.collateralHub(address(core), address(line), governance, operator);
        hubId = bytes32(uint256(uint160(address(hub))));
        peer = bytes32(uint256(uint160(address(vault))));

        relay = new ReleaseRelay(address(remoteCore), address(vault), CREDITCOIN, hubId, governance);

        vm.startPrank(governance);
        line.setRemoteCollateralHub(address(hub));
        hub.setVaultPeer(BASE_SEPOLIA, peer);
        nativeAsset = hub.listAsset(BASE_SEPOLIA, bytes32(0), 18, 1000 * ONE);
        // The relay takes the role a person used to hold.
        vault.setOperator(address(relay));
        vm.stopPrank();

        // A drawable pool, so the debt in these tests is a real one.
        vm.deal(address(this), 1000 ether);
        line.fund{value: 1000 ether}();

        // Alice has 1 ETH locked on Base and credited on Creditcoin.
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vault.lockNative{value: 1 ether}();
        hub.receiveFromWormhole(_depositVaa(1 ether));
    }

    function _depositVaa(uint256 amount) internal view returns (bytes memory) {
        return core.buildVaa(
            BASE_SEPOLIA,
            peer,
            0,
            CollateralMessage.encode(
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: amount, decimals: 18
                })
            )
        );
    }

    /// The message Creditcoin publishes, as the guardians would hand it back.
    function _releaseVaa(uint64 sequence, uint256 amount, bytes32 emitter)
        internal
        view
        returns (bytes memory)
    {
        return remoteCore.buildVaa(
            CREDITCOIN,
            emitter,
            sequence,
            CollateralMessage.encodeRelease(
                BASE_SEPOLIA,
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: amount, decimals: 18
                })
            )
        );
    }

    // ----------------------------------------------------------------
    // The whole way round
    // ----------------------------------------------------------------

    function test_borrowerGetsCollateralBackWithNobodyApprovingIt() public {
        assertEq(line.collateralValueOf(alice), 1000 * ONE);

        vm.prank(alice);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 1 ether);

        // Credit is gone on Creditcoin the moment the request is accepted.
        assertEq(line.collateralValueOf(alice), 0);

        // Anyone may carry the message; the relay trusts the signatures.
        relay.executeRelease(_releaseVaa(0, 1 ether, hubId));

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.unlockNative(1 ether);

        assertEq(alice.balance, before + 1 ether);
        assertEq(vault.nativeBalanceOf(alice), 0);
    }

    function test_theVaultOperatorIsAContractNotAPerson() public view {
        assertEq(vault.operator(), address(relay));
        assertTrue(relay.armed());
    }

    // ----------------------------------------------------------------
    // The credit line still has to be whole
    // ----------------------------------------------------------------

    /// The failure this path exists to prevent: walking away with the
    /// collateral while the debt stands.
    function test_releaseThatWouldStrandDebtIsRefused() public {
        vm.prank(alice);
        line.draw(500 * ONE);

        vm.prank(alice);
        vm.expectRevert();
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 1 ether);

        // Nothing moved.
        assertEq(hub.collateralOf(alice, nativeAsset), 1 ether);
        assertEq(line.collateralValueOf(alice), 1000 * ONE);
    }

    function test_partialReleaseIsAllowedWhileTheRestStillCoversTheDebt() public {
        vm.prank(alice);
        line.draw(100 * ONE);

        vm.prank(alice);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 0.5 ether);

        assertEq(hub.collateralOf(alice, nativeAsset), 0.5 ether);
        assertGe(line.limitOf(alice), 100 * ONE);
    }

    function test_cannotReleaseMoreThanIsHeld() public {
        vm.prank(alice);
        vm.expectRevert(CreditErrors.InsufficientCollateral.selector);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 2 ether);
    }

    function test_cannotReleaseAnUnlistedAsset() public {
        bytes32 expected = CollateralMessage.assetId(BASE_SEPOLIA, bytes32(uint256(1)));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CreditErrors.AssetNotListed.selector, expected));
        hub.requestRelease(BASE_SEPOLIA, bytes32(uint256(1)), 1);
    }

    function test_cannotReleaseZero() public {
        vm.prank(alice);
        vm.expectRevert(CreditErrors.ZeroAmount.selector);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 0);
    }

    // ----------------------------------------------------------------
    // Only Creditcoin may release
    // ----------------------------------------------------------------

    /// Without this check, anyone who can publish a Wormhole message could
    /// empty every vault on the chain.
    function test_messageFromAnyoneButTheHubIsRejected() public {
        bytes32 impostor = bytes32(uint256(uint160(makeAddr("impostor"))));
        bytes memory vaa = _releaseVaa(0, 1 ether, impostor);

        vm.expectRevert(
            abi.encodeWithSelector(ReleaseRelay.NotTheHub.selector, CREDITCOIN, impostor)
        );
        relay.executeRelease(vaa);
    }

    function test_messageFromAnotherChainIsRejected() public {
        bytes memory vaa = remoteCore.buildVaa(
            BASE_SEPOLIA, // not Creditcoin
            hubId,
            0,
            CollateralMessage.encodeRelease(
                BASE_SEPOLIA,
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: 1 ether, decimals: 18
                })
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(ReleaseRelay.NotTheHub.selector, BASE_SEPOLIA, hubId)
        );
        relay.executeRelease(vaa);
    }

    function test_theSameReleaseCannotBeAppliedTwice() public {
        vm.prank(alice);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 1 ether);

        bytes memory vaa = _releaseVaa(0, 1 ether, hubId);
        relay.executeRelease(vaa);

        vm.expectRevert(
            abi.encodeWithSelector(
                ReleaseRelay.AlreadyConsumed.selector,
                keccak256(abi.encodePacked(CREDITCOIN, hubId, uint64(0)))
            )
        );
        relay.executeRelease(vaa);
    }

    function test_unverifiedReleaseIsRejected() public {
        bytes memory vaa = _releaseVaa(0, 1 ether, hubId);
        remoteCore.setVerifies(false);

        vm.expectRevert(
            abi.encodeWithSelector(ReleaseRelay.VaaInvalid.selector, "VM signature invalid")
        );
        relay.executeRelease(vaa);
    }

    /// A deposit and a release share a layout and differ in one byte. The relay
    /// must refuse a deposit payload rather than read it as permission to pay out.
    function test_aDepositPayloadIsNotAWithdrawal() public {
        bytes memory vaa = remoteCore.buildVaa(
            CREDITCOIN,
            hubId,
            0,
            CollateralMessage.encode( // version 1, a deposit
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: 1 ether, decimals: 18
                })
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(CollateralMessage.UnsupportedVersion.selector, uint8(1))
        );
        relay.executeRelease(vaa);
    }

    /// And the reverse: a release must not be creditable as a deposit.
    function test_aReleasePayloadIsNotADeposit() public {
        bytes memory vaa = core.buildVaa(
            BASE_SEPOLIA,
            peer,
            9,
            CollateralMessage.encodeRelease(
                BASE_SEPOLIA,
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: 1 ether, decimals: 18
                })
            )
        );
        vm.expectRevert(
            abi.encodeWithSelector(CollateralMessage.UnsupportedVersion.selector, uint8(2))
        );
        hub.receiveFromWormhole(vaa);
    }

    /// The one the first version of this contract got wrong.
    ///
    /// Every relay trusts the same emitter, so a release that does not name its
    /// destination is a withdrawal from every vault at once. Worse than it
    /// sounds: the amount is the same on each chain but the asset is not, so
    /// 0.2 of a cheap coin becomes 0.2 of an expensive one somewhere else.
    function test_anotherChainsReleaseIsRefused() public {
        uint16 otherChain = 6; // Avalanche Fuji
        MockWormhole otherCore = new MockWormhole(otherChain, 0);
        WormholeVault otherVault = new WormholeVault(address(otherCore), governance, operator);
        ReleaseRelay otherRelay = new ReleaseRelay(
            address(otherCore), address(otherVault), CREDITCOIN, hubId, governance
        );

        vm.prank(governance);
        otherVault.setOperator(address(otherRelay));

        // A release addressed to Base Sepolia, offered to the Fuji relay.
        bytes memory vaa = otherCore.buildVaa(
            CREDITCOIN,
            hubId,
            0,
            CollateralMessage.encodeRelease(
                BASE_SEPOLIA,
                CollateralMessage.Deposit({
                    account: alice, token: bytes32(0), amount: 1 ether, decimals: 18
                })
            )
        );

        vm.expectRevert(
            abi.encodeWithSelector(ReleaseRelay.WrongChain.selector, otherChain, BASE_SEPOLIA)
        );
        otherRelay.executeRelease(vaa);

        // And nothing was approved on the far vault.
        assertEq(otherVault.nativeReleasable(alice), 0);
    }

    function test_theRightChainsReleaseStillWorksOnItsOwnRelay() public {
        vm.prank(alice);
        hub.requestRelease(BASE_SEPOLIA, bytes32(0), 1 ether);
        relay.executeRelease(_releaseVaa(0, 1 ether, hubId));
        assertEq(vault.nativeReleasable(alice), 1 ether);
    }

    function test_onlyOwnerRepointsTheHub() public {
        vm.prank(alice);
        vm.expectRevert();
        relay.setHub(bytes32(uint256(1)));

        vm.prank(governance);
        relay.setHub(bytes32(uint256(1)));
        assertEq(relay.hub(), bytes32(uint256(1)));
    }

    function test_armedIsFalseUntilTheVaultHandsOverTheRole() public {
        ReleaseRelay fresh =
            new ReleaseRelay(address(remoteCore), address(vault), CREDITCOIN, hubId, governance);
        assertFalse(fresh.armed());
        vm.expectRevert(
            abi.encodeWithSelector(ReleaseRelay.NotTheOperator.selector, address(relay))
        );
        fresh.requireArmed();
    }
}
