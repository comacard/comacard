// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title BridgedUSDT
/// @notice A testnet stand-in for Creditcoin Bridged USDT, at the same six
///         decimals as the real thing.
///
/// @dev **This is not bridged USDT and is not backed by anything.** The real
///      USDT.C exists only on Creditcoin mainnet, carried there by a Wormhole
///      NTT deployment; there is no testnet counterpart, which is why this
///      exists. Anyone can mint it from `faucet`, and that open mint is the
///      plainest signal that it is a stand-in — a bridged asset can only be
///      created by bridging.
///
///      Deploy on testnets only.
contract BridgedUSDT is ERC20 {
    /// @notice Most one `faucet` call can mint, in whole tokens.
    uint256 public constant FAUCET_LIMIT = 100_000;

    error OverFaucetLimit(uint256 requested, uint256 limit);

    constructor() ERC20("Creditcoin Bridged USDT (testnet stand-in)", "USDT.C") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint yourself test tokens, up to FAUCET_LIMIT whole units a call.
    function faucet(uint256 wholeTokens) external {
        if (wholeTokens > FAUCET_LIMIT) revert OverFaucetLimit(wholeTokens, FAUCET_LIMIT);
        _mint(msg.sender, wholeTokens * 10 ** 6);
    }
}
