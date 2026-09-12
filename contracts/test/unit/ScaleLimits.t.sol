// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {CollateralMessage} from "../../src/libraries/CollateralMessage.sol";
import {WormholeCollateralHub} from "../../src/wormhole/WormholeCollateralHub.sol";
import {CreditLineHarness} from "../helpers/CreditLineHarness.sol";
import {Deployers} from "../helpers/Deployers.sol";
import {MockWormhole} from "../helpers/MockWormhole.sol";

/// @notice What a fully listed protocol costs to read.
///
/// Every limit check walks every listed asset — the credit line's own tokens and
/// then the hub's, through an external call. That is a loop whose length is a
/// governance decision, and a draw that runs out of gas at the cap would be a
/// protocol that stops working the day it gets popular rather than the day
/// somebody attacks it. So the caps are exercised rather than assumed.
contract ScaleLimitsTest is Test {
    uint256 internal constant ONE = 1e18;
    uint160 internal constant MAX_TOKENS = 16;
    uint16 internal constant MAX_ASSETS = 32;

    CreditLineHarness internal line;
    WormholeCollateralHub internal hub;
    address internal governance = makeAddr("governance");
    address internal operator = makeAddr("operator");
    address internal alice = makeAddr("alice");

    function setUp() public {
        line = Deployers.creditLineHarness(makeAddr("sourceVault"), 1, governance, operator);
        hub = Deployers.collateralHub(
            address(new MockWormhole(59, 0)), address(line), governance, operator
        );

        vm.startPrank(governance);
        line.setRemoteCollateralHub(address(hub));

        // Fill both registries to their ceiling, and give the borrower a
        // position in every one so no loop can skip on a zero balance.
        for (uint160 i = 0; i < MAX_TOKENS; ++i) {
            line.listToken(_token(i), i % 2 == 0 ? 6 : 18, ONE);
        }
        for (uint16 i = 0; i < MAX_ASSETS; ++i) {
            hub.setVaultPeer(_chain(i), _peer(i));
            hub.listAsset(_chain(i), _remoteToken(i), 18, ONE);
        }
        vm.stopPrank();

        for (uint160 i = 0; i < MAX_TOKENS; ++i) {
            line.seedToken(alice, _token(i), 1e6);
        }
        for (uint16 i = 0; i < MAX_ASSETS; ++i) {
            hub.receiveFromWormhole(_vaa(_chain(i), _peer(i), _remoteToken(i)));
        }
    }

    // Distinct addresses and chains, typed at the width they are used, so the
    // compiler can see there is nothing to truncate.
    function _token(uint160 i) internal pure returns (address) {
        return address(0x1000 + i);
    }

    function _chain(uint16 i) internal pure returns (uint16) {
        return 10_000 + i;
    }

    function _peer(uint16 i) internal pure returns (bytes32) {
        return bytes32(uint256(0x3000) + i);
    }

    function _remoteToken(uint16 i) internal pure returns (bytes32) {
        return bytes32(uint256(0x2000) + i);
    }

    function _vaa(uint16 chain, bytes32 peer, bytes32 token) internal view returns (bytes memory) {
        return MockWormhole(address(hub.wormhole()))
            .buildVaa(
                chain,
                peer,
                0,
                CollateralMessage.encode(
                    CollateralMessage.Deposit({
                        account: alice, token: token, amount: ONE, decimals: 18
                    })
                )
            );
    }

    function test_aFullyListedProtocolStillPricesCollateral() public view {
        assertEq(line.listedTokens().length, uint256(MAX_TOKENS));
        assertEq(hub.listedAssets().length, uint256(MAX_ASSETS));
        assertGt(line.collateralValueOf(alice), 0);
    }

    /// The number that matters: reading a limit with every asset listed and held.
    function test_limitAtTheCapFitsInABlock() public {
        uint256 before = gasleft();
        line.limitOf(alice);
        uint256 used = before - gasleft();

        emit log_named_uint("gas to read a limit at both caps", used);
        // Creditcoin's block limit is far above this; the bar is that a draw,
        // which does the same walk, is nowhere near it.
        assertLt(used, 3_000_000);
    }

    function test_drawAtTheCapSucceeds() public {
        vm.deal(address(this), 1000 ether);
        line.fund{value: 1000 ether}();

        uint256 available = line.availableOf(alice);
        assertGt(available, 0);

        vm.prank(alice);
        line.draw(available / 2);
        assertEq(line.accountOf(alice).drawn, available / 2);
    }
}
