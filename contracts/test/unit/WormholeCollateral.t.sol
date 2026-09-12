// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CollateralMessage} from "../../src/libraries/CollateralMessage.sol";
import {TestToken} from "../../src/testnet/TestToken.sol";
import {CreditErrors} from "../../src/types/CreditTypes.sol";
import {WormholeCollateralHub} from "../../src/wormhole/WormholeCollateralHub.sol";
import {WormholeVault} from "../../src/wormhole/WormholeVault.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {MockWormhole} from "../helpers/MockWormhole.sol";

/// @notice Collateral deposited on a chain Attestcoin cannot reach, carried by
///         Wormhole instead.
///
/// @dev The signatures are mocked because guardians cannot sign locally. What is
///      not mocked is everything that decides whether a message is *ours*: the
///      peer registry, the replay guard, and the decimals check. Those are the
///      three ways free money gets minted here, so those are what the suite is
///      about.
contract WormholeCollateralTest is Test {
    uint16 internal constant BASE_SEPOLIA = 10_004;
    uint16 internal constant ARBITRUM_SEPOLIA = 10_003;
    uint256 internal constant ONE = 1e18;

    CreditLineHarness internal line;
    WormholeCollateralHub internal hub;
    MockWormhole internal core;
    WormholeVault internal vault;
    MockWormhole internal remoteCore;
    TestToken internal usdc;

    address internal governance = makeAddr("governance");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");

    bytes32 internal peer;
    bytes32 internal nativeAsset;
    bytes32 internal usdcAsset;

    function setUp() public {
        line = Deployers.creditLineHarness(makeAddr("sourceVault"), 1, governance, operator);
        core = new MockWormhole(59, 0);

        // The remote side, as it would be on Base Sepolia.
        remoteCore = new MockWormhole(BASE_SEPOLIA, 1e15);
        vault = new WormholeVault(address(remoteCore), governance, operator);
        usdc = new TestToken("USD Coin", "USDC", 6);

        hub = Deployers.collateralHub(address(core), address(line), governance, operator);

        vm.startPrank(governance);
        line.setRemoteCollateralHub(address(hub));

        peer = bytes32(uint256(uint160(address(vault))));
        hub.setVaultPeer(BASE_SEPOLIA, peer);

        // 1 ETH on Base is worth 1000 CTC; 1 USDC is worth 1 CTC.
        nativeAsset = hub.listAsset(BASE_SEPOLIA, bytes32(0), 18, 1000 * ONE);
        usdcAsset = hub.listAsset(BASE_SEPOLIA, bytes32(uint256(uint160(address(usdc)))), 6, ONE);

        vault.setSupportedToken(address(usdc), true);
        vm.stopPrank();
    }

    function _vaa(uint16 chain, bytes32 emitter, uint64 seq, CollateralMessage.Deposit memory d)
        internal
        view
        returns (bytes memory)
    {
        return core.buildVaa(chain, emitter, seq, CollateralMessage.encode(d));
    }

    function _deposit(bytes32 token, uint256 amount, uint8 decimals)
        internal
        pure
        returns (CollateralMessage.Deposit memory)
    {
        return CollateralMessage.Deposit({
            account: address(0), token: token, amount: amount, decimals: decimals
        });
    }

    function _aliceDeposit(bytes32 token, uint256 amount, uint8 decimals)
        internal
        view
        returns (CollateralMessage.Deposit memory d)
    {
        d = _deposit(token, amount, decimals);
        d.account = alice;
    }

    // ----------------------------------------------------------------
    // The vault side
    // ----------------------------------------------------------------

    function test_lockNativeCreditsWhatArrivedAfterTheFee() public {
        uint256 fee = remoteCore.messageFee();
        vm.deal(alice, 2 ether);

        vm.prank(alice);
        vault.lockNative{value: 1 ether}();

        // The fee is Wormhole's, not the borrower's collateral.
        assertEq(vault.nativeBalanceOf(alice), 1 ether - fee);
        assertEq(address(vault).balance, 1 ether - fee);

        CollateralMessage.Deposit memory d =
            CollateralMessage.decode(remoteCore.publishedPayload(0));
        assertEq(d.account, alice);
        assertEq(d.token, bytes32(0));
        assertEq(d.amount, 1 ether - fee);
        assertEq(d.decimals, 18);
    }

    function test_lockNativeRejectsValueBelowTheFee() public {
        uint256 fee = remoteCore.messageFee();
        vm.deal(alice, 1 ether);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(WormholeVault.FeeNotCovered.selector, fee, fee));
        vault.lockNative{value: fee}();
    }

    function test_lockTokenPublishesItsOwnDecimals() public {
        vm.deal(alice, 1 ether);

        vm.startPrank(alice);
        usdc.faucet(500);
        usdc.approve(address(vault), 500e6);
        vault.lockToken{value: remoteCore.messageFee()}(address(usdc), 500e6);
        vm.stopPrank();

        assertEq(vault.tokenBalanceOf(alice, address(usdc)), 500e6);

        CollateralMessage.Deposit memory d =
            CollateralMessage.decode(remoteCore.publishedPayload(0));
        assertEq(d.amount, 500e6);
        assertEq(d.decimals, 6);
    }

    function test_lockTokenRejectsUnlistedToken() public {
        TestToken other = new TestToken("Other", "OTH", 18);
        vm.deal(alice, 1 ether);

        other.faucet(1);
        uint256 fee = remoteCore.messageFee();

        vm.startPrank(alice);
        other.approve(address(vault), ONE);
        vm.expectRevert(
            abi.encodeWithSelector(WormholeVault.TokenNotSupported.selector, address(other))
        );
        vault.lockToken{value: fee}(address(other), ONE);
        vm.stopPrank();
    }

    function test_onlyOperatorApprovesRelease() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(WormholeVault.NotOperator.selector, alice));
        vault.approveRelease(alice, address(0), 1 ether);
    }

    function test_unlockNeedsAnApprovalAndConsumesIt() public {
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vault.lockNative{value: 1 ether}();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(WormholeVault.NotReleasable.selector, 0, 0.5 ether));
        vault.unlockNative(0.5 ether);

        vm.prank(operator);
        vault.approveRelease(alice, address(0), 0.5 ether);

        uint256 before = alice.balance;
        vm.prank(alice);
        vault.unlockNative(0.5 ether);

        assertEq(alice.balance, before + 0.5 ether);
        assertEq(vault.nativeReleasable(alice), 0);
    }

    // ----------------------------------------------------------------
    // The credit line side
    // ----------------------------------------------------------------

    function test_remoteNativeDepositRaisesTheLimit() public {
        assertEq(line.collateralValueOf(alice), 0);

        hub.receiveFromWormhole(_vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18)));

        // 1 ETH on Base, priced at 1000 CTC.
        assertEq(line.collateralValueOf(alice), 1000 * ONE);
        assertGt(line.limitOf(alice), 0);
    }

    /// The same failure the multi-asset suite exists for, one chain further out:
    /// 500 USDC is 500e6 base units and must not be valued as 500e6 wei.
    function test_sixDecimalRemoteAssetIsValuedByItsOwnDecimals() public {
        bytes32 token = bytes32(uint256(uint160(address(usdc))));
        hub.receiveFromWormhole(_vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(token, 500e6, 6)));

        assertEq(line.collateralValueOf(alice), 500 * ONE);
    }

    function test_assetsFromDifferentChainsAreDifferentAssets() public {
        // Same address, other chain: not listed, so it buys no credit.
        bytes32 token = bytes32(uint256(uint160(address(usdc))));
        vm.prank(governance);
        hub.setVaultPeer(ARBITRUM_SEPOLIA, peer);

        bytes32 expected = CollateralMessage.assetId(ARBITRUM_SEPOLIA, token);
        bytes memory vaa = _vaa(ARBITRUM_SEPOLIA, peer, 0, _aliceDeposit(token, 500e6, 6));

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.AssetNotListed.selector, expected));
        hub.receiveFromWormhole(vaa);
    }

    /// The whole point of the peer registry. Anyone can deploy a vault, lock
    /// nothing, and publish a message that Wormhole will happily sign.
    function test_messageFromAnUnknownVaultIsRejected() public {
        bytes32 impostor = bytes32(uint256(uint160(makeAddr("impostor"))));
        bytes memory vaa = _vaa(BASE_SEPOLIA, impostor, 0, _aliceDeposit(bytes32(0), ONE, 18));

        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.UnknownPeer.selector, BASE_SEPOLIA, impostor)
        );
        hub.receiveFromWormhole(vaa);
    }

    function test_messageFromAnUnregisteredChainIsRejected() public {
        bytes memory vaa = _vaa(ARBITRUM_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18));

        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.UnknownPeer.selector, ARBITRUM_SEPOLIA, peer)
        );
        hub.receiveFromWormhole(vaa);
    }

    /// Wormhole says a message is authentic. It never says it is fresh.
    function test_theSameVaaCannotBeAppliedTwice() public {
        bytes memory vaa = _vaa(BASE_SEPOLIA, peer, 7, _aliceDeposit(bytes32(0), ONE, 18));
        hub.receiveFromWormhole(vaa);

        uint256 value = line.collateralValueOf(alice);

        vm.expectRevert(
            abi.encodeWithSelector(
                CreditErrors.VaaAlreadyConsumed.selector,
                keccak256(abi.encodePacked(BASE_SEPOLIA, peer, uint64(7)))
            )
        );
        hub.receiveFromWormhole(vaa);

        assertEq(line.collateralValueOf(alice), value);
    }

    function test_unverifiedVaaIsRejected() public {
        bytes memory vaa = _vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18));
        core.setVerifies(false);

        vm.expectRevert(
            abi.encodeWithSelector(CreditErrors.VaaInvalid.selector, "VM signature invalid")
        );
        hub.receiveFromWormhole(vaa);
    }

    /// A vault reporting decimals we did not list means one of the two is wrong
    /// about the token. Guessing which would be a pricing error of 1e12.
    function test_decimalsMismatchIsRejected() public {
        bytes32 token = bytes32(uint256(uint160(address(usdc))));
        bytes memory vaa = _vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(token, 500e6, 18));

        vm.expectRevert(abi.encodeWithSelector(CreditErrors.DecimalsMismatch.selector, 6, 18));
        hub.receiveFromWormhole(vaa);
    }

    function test_payloadFromAFutureVersionIsRefusedNotMisread() public {
        bytes memory payload =
            abi.encode(uint8(2), bytes32(uint256(uint160(alice))), bytes32(0), ONE, uint8(18));
        bytes memory vaa = core.buildVaa(BASE_SEPOLIA, peer, 0, payload);

        vm.expectRevert(
            abi.encodeWithSelector(CollateralMessage.UnsupportedVersion.selector, uint8(2))
        );
        hub.receiveFromWormhole(vaa);
    }

    function test_remoteCollateralStacksWithAttestcoinCollateral() public {
        line.seed(alice, 2 ether, 0, 0, 0); // proved on Sepolia, priced at parity
        hub.receiveFromWormhole(_vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18)));

        assertEq(line.collateralValueOf(alice), 2 ether + 1000 * ONE);
    }

    function test_onlyAdminRegistersPeersAndAssets() public {
        vm.startPrank(alice);
        vm.expectRevert();
        hub.setVaultPeer(BASE_SEPOLIA, peer);
        vm.expectRevert();
        hub.listAsset(ARBITRUM_SEPOLIA, bytes32(0), 18, ONE);
        vm.stopPrank();
    }

    function test_onlyOracleRepricesARemoteAsset() public {
        vm.prank(alice);
        vm.expectRevert();
        hub.setAssetPrice(nativeAsset, 500 * ONE);

        vm.prank(operator);
        hub.setAssetPrice(nativeAsset, 500 * ONE);

        hub.receiveFromWormhole(_vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18)));
        assertEq(line.collateralValueOf(alice), 500 * ONE);
    }

    function test_listedRemoteAssetsAreEnumerable() public view {
        bytes32[] memory assets = hub.listedAssets();
        assertEq(assets.length, 2);
        assertEq(assets[0], nativeAsset);
        assertEq(assets[1], usdcAsset);
    }

    function test_pausedLineAcceptsNoDeposits() public {
        bytes memory vaa = _vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), ONE, 18));
        bytes32 guardianRole = hub.GUARDIAN_ROLE();

        vm.startPrank(governance);
        hub.grantRole(guardianRole, governance);
        hub.pause();
        vm.stopPrank();

        vm.expectRevert();
        hub.receiveFromWormhole(vaa);
    }

    function testFuzz_valueIsLinearInAmount(uint128 amount) public {
        vm.assume(amount > 0);
        hub.receiveFromWormhole(_vaa(BASE_SEPOLIA, peer, 0, _aliceDeposit(bytes32(0), amount, 18)));
        assertEq(line.collateralValueOf(alice), (uint256(amount) * 1000 * ONE) / ONE);
    }
}
