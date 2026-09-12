// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title WrappedCTC
/// @notice Native CTC as an ERC20, the way WETH wraps ether: deposit native
///         value and hold a token, burn the token and take the value back.
///
/// @dev Not a bridge, and worth being precise about because the symbol invites
///      the confusion. On Creditcoin mainnet, WCTC is an NTT deployment that
///      genuinely moves CTC to Ethereum and BSC. This contract does nothing of
///      the kind — it wraps CTC into an ERC20 on the same chain, so contracts
///      that only speak ERC20 can hold it. Every token here is backed one to
///      one by native CTC sitting in this contract, and nothing else.
contract WrappedCTC is ERC20 {
    event Deposit(address indexed account, uint256 amount);
    event Withdrawal(address indexed account, uint256 amount);

    error NothingToWrap();
    error InsufficientBalance(uint256 held, uint256 requested);

    constructor() ERC20("Wrapped CTC", "WCTC") {}

    /// @notice Wrap the native CTC sent with this call.
    function deposit() public payable {
        if (msg.value == 0) revert NothingToWrap();
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Burn WCTC and take the native CTC back.
    function withdraw(uint256 amount) external {
        uint256 held = balanceOf(msg.sender);
        if (amount == 0) revert NothingToWrap();
        if (amount > held) revert InsufficientBalance(held, amount);

        _burn(msg.sender, amount);
        emit Withdrawal(msg.sender, amount);
        Address.sendValue(payable(msg.sender), amount);
    }

    /// @notice Plain transfers wrap, so sending CTC here is never a loss.
    receive() external payable {
        deposit();
    }
}
