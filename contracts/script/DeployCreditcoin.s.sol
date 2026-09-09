// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

import {ASCCreditLine} from "../src/creditcoin/ASCCreditLine.sol";
import {CtcStakingAdapter} from "../src/creditcoin/CtcStakingAdapter.sol";

/// @notice Deploys the credit line and its yield adapter on Creditcoin CC3,
///         each behind a UUPS proxy.
/// @dev The EvmV1Decoder library is linked at deploy time:
///
///      forge script script/DeployCreditcoin.s.sol --rpc-url creditcoin --broadcast \
///        --libraries vendor/attestcoin/common/EvmV1Decoder.sol:EvmV1Decoder:$EVM_V1_DECODER_LIBRARY_ADDRESS
contract DeployCreditcoin is Script {
    /// @dev Creditcoin-internal id for Ethereum Sepolia.
    uint64 internal constant SEPOLIA_CHAIN_KEY = 1;

    function run() external returns (ASCCreditLine line, CtcStakingAdapter adapter) {
        address sourceVault = vm.envAddress("SOURCE_VAULT_ADDRESS");
        address deployer = vm.addr(vm.envUint("WALLET_PK"));
        address governance = vm.envOr("GOVERNANCE_ADDRESS", deployer);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        address stakingAccount = vm.envOr("STAKING_ACCOUNT_ADDRESS", deployer);
        uint48 delay = uint48(vm.envOr("ADMIN_TRANSFER_DELAY", uint256(3 days)));

        vm.startBroadcast(vm.envUint("WALLET_PK"));

        ASCCreditLine lineImpl = new ASCCreditLine();
        ERC1967Proxy lineProxy = new ERC1967Proxy(
            address(lineImpl),
            abi.encodeCall(
                ASCCreditLine.initialize,
                (sourceVault, SEPOLIA_CHAIN_KEY, governance, operator, delay)
            )
        );
        line = ASCCreditLine(payable(address(lineProxy)));

        CtcStakingAdapter adapterImpl = new CtcStakingAdapter();
        ERC1967Proxy adapterProxy = new ERC1967Proxy(
            address(adapterImpl),
            abi.encodeCall(
                CtcStakingAdapter.initialize,
                (address(line), governance, operator, stakingAccount, delay)
            )
        );
        adapter = CtcStakingAdapter(payable(address(adapterProxy)));

        vm.stopBroadcast();

        console.log("ASCCreditLine proxy:     ", address(lineProxy));
        console.log("CtcStakingAdapter proxy: ", address(adapterProxy));
        console.log("");
        console.log("Next, as governance: line.setYieldAdapter(adapter)");
    }
}
