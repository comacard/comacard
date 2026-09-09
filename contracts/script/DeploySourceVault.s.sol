// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {SourceVault} from "../src/source/SourceVault.sol";

/// @notice Deploys the collateral vault on the source chain (Ethereum Sepolia).
/// @dev forge script script/DeploySourceVault.s.sol --rpc-url sepolia --broadcast
contract DeploySourceVault is Script {
    function run() external returns (SourceVault vault) {
        address deployer = vm.addr(vm.envUint("WALLET_PK"));
        address governance = vm.envOr("GOVERNANCE_ADDRESS", deployer);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        uint48 delay = uint48(vm.envOr("ADMIN_TRANSFER_DELAY", uint256(3 days)));

        vm.startBroadcast(vm.envUint("WALLET_PK"));
        SourceVault implementation = new SourceVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeCall(SourceVault.initialize, (governance, operator, delay))
        );
        vm.stopBroadcast();

        vault = SourceVault(address(proxy));
        console.log("SourceVault proxy:         ", address(proxy));
        console.log("SourceVault implementation:", address(implementation));
        console.log("governance:                ", governance);
    }
}
