// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestToken
/// @notice A faucet token for the Sepolia demo. Anyone may mint, which is the
///         point: it stands in for USDC, USDT or WETH so the multi-asset path
///         can be exercised without real funds.
/// @dev Never deploy this anywhere value lives. Decimals are configurable
///      because the whole reason these exist is to prove that a 6-decimal
///      stablecoin and an 18-decimal asset are valued correctly side by side.
contract TestToken is ERC20 {
    uint8 private immutable DECIMALS;

    /// @notice Most one call to `faucet` can mint, in whole tokens.
    uint256 public constant FAUCET_LIMIT = 100_000;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Mint yourself test tokens, up to FAUCET_LIMIT whole units a call.
    function faucet(uint256 wholeTokens) external {
        require(wholeTokens <= FAUCET_LIMIT, "TestToken: over faucet limit");
        _mint(msg.sender, wholeTokens * 10 ** DECIMALS);
    }
}
