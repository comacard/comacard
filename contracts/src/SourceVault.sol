// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title SourceVault
/// @notice Holds collateral on the source chain (Sepolia) and emits the events
///         that Creditcoin proves through Attestcoin.
/// @dev    Collateral never leaves this chain. Attestcoin is read-only today —
///         writability is still in audit — so Creditcoin cannot release funds
///         directly. Withdrawal is therefore gated on a voucher signed by the
///         credit line operator once the debt is settled.
contract SourceVault {
    event CollateralLocked(address indexed account, uint256 amount, uint256 nonce);
    event CollateralUnlocked(address indexed account, uint256 amount, uint256 nonce);

    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public nonceOf;

    error NothingLocked();
    error InsufficientBalance();
    error TransferFailed();

    /// @notice Lock native value as collateral backing a Creditcoin credit line.
    function lock() external payable {
        if (msg.value == 0) revert NothingLocked();
        balanceOf[msg.sender] += msg.value;
        emit CollateralLocked(msg.sender, msg.value, nonceOf[msg.sender]++);
    }

    /// @notice Withdraw collateral. Release authorisation is enforced by the
    ///         operator in a later revision; kept open here so the event shape
    ///         can be proved end to end first.
    /// ponytail: no voucher check yet — add before anything of value is locked.
    function unlock(uint256 amount) external {
        uint256 balance = balanceOf[msg.sender];
        if (amount == 0 || amount > balance) revert InsufficientBalance();
        balanceOf[msg.sender] = balance - amount;
        emit CollateralUnlocked(msg.sender, amount, nonceOf[msg.sender]++);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
