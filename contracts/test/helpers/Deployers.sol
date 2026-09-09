// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import {ASCCreditLine} from "../../src/creditcoin/ASCCreditLine.sol";
import {CtcStakingAdapter} from "../../src/creditcoin/CtcStakingAdapter.sol";
import {SourceVault} from "../../src/source/SourceVault.sol";
import {CreditLineHarness} from "./CreditLineHarness.sol";

/// @notice Every contract runs behind a UUPS proxy in production, so the tests
///         exercise it that way too. Testing the implementation directly would
///         miss initializer and storage-layout mistakes entirely.
library Deployers {
    uint48 internal constant DEFAULT_ADMIN_DELAY = 3 days;

    function sourceVault(address governance, address operator) internal returns (SourceVault) {
        SourceVault impl = new SourceVault();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(SourceVault.initialize, (governance, operator, DEFAULT_ADMIN_DELAY))
        );
        return SourceVault(address(proxy));
    }

    function creditLine(address vault, uint64 chainKey, address governance, address operator)
        internal
        returns (ASCCreditLine)
    {
        ASCCreditLine impl = new ASCCreditLine();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                ASCCreditLine.initialize,
                (vault, chainKey, governance, operator, DEFAULT_ADMIN_DELAY)
            )
        );
        return ASCCreditLine(payable(address(proxy)));
    }

    function creditLineHarness(address vault, uint64 chainKey, address governance, address operator)
        internal
        returns (CreditLineHarness)
    {
        CreditLineHarness impl = new CreditLineHarness();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                ASCCreditLine.initialize,
                (vault, chainKey, governance, operator, DEFAULT_ADMIN_DELAY)
            )
        );
        return CreditLineHarness(payable(address(proxy)));
    }

    function stakingAdapter(
        address line,
        address governance,
        address operator,
        address stakingAccount
    ) internal returns (CtcStakingAdapter) {
        CtcStakingAdapter impl = new CtcStakingAdapter();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                CtcStakingAdapter.initialize,
                (line, governance, operator, stakingAccount, DEFAULT_ADMIN_DELAY)
            )
        );
        return CtcStakingAdapter(payable(address(proxy)));
    }
}
