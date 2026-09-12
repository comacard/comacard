// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {IWormhole} from "../src/interfaces/IWormhole.sol";
import {WormholeVault} from "../src/wormhole/WormholeVault.sol";

/// @notice Deploys a collateral vault on any chain Wormhole reaches.
///
/// @dev Testnets only. One invocation per chain:
///
///      WORMHOLE_CORE=0x79A1027a6A159502049F10906D333EC57E95F083 \
///        forge script script/DeployWormholeVault.s.sol --rpc-url base_sepolia --broadcast
///
///      Then register the deployed address with the credit line on Creditcoin:
///      line.setVaultPeer(<wormhole chain id>, bytes32(uint256(uint160(vault))))
contract DeployWormholeVault is Script {
    function run() external returns (WormholeVault vault) {
        address core = vm.envAddress("WORMHOLE_CORE");
        address deployer = vm.addr(vm.envUint("WALLET_PK"));
        address governance = vm.envOr("GOVERNANCE_ADDRESS", deployer);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);

        vm.startBroadcast(vm.envUint("WALLET_PK"));
        vault = new WormholeVault(core, governance, operator);
        vm.stopBroadcast();

        uint16 chainId = IWormhole(core).chainId();
        console.log("WormholeVault:     ", address(vault));
        console.log("wormhole chain id: ", chainId);
        console.log("message fee (wei): ", IWormhole(core).messageFee());
        console.log("");
        console.log("peer bytes32:");
        console.logBytes32(bytes32(uint256(uint160(address(vault)))));
    }
}
