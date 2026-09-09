// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Governed} from "../governance/Governed.sol";
import {ISourceVault} from "../interfaces/ISourceVault.sol";
import {CreditErrors} from "../types/CreditTypes.sol";

/// @title SourceVault
/// @notice Holds collateral on the source chain and emits the events Creditcoin
///         proves through Attestcoin.
/// @dev Collateral never leaves this chain — that is the point. Attestcoin is
///      read-only today (writability is still in audit), so Creditcoin cannot
///      reach back to release funds. Withdrawal is therefore gated by the
///      operator, who signs a release only once the debt is settled.
contract SourceVault is ISourceVault, Governed, ReentrancyGuardUpgradeable {
    mapping(address => uint256) public override balanceOf;
    mapping(address => uint256) public override nonceOf;

    /// @notice Collateral the operator has cleared for withdrawal.
    mapping(address => uint256) public releasable;

    event ReleaseApproved(address indexed account, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param governance Multisig or timelock holding admin rights.
    /// @param operator Hot key that approves releases against settled debt.
    /// @param adminTransferDelay Seconds a governance handover must wait.
    function initialize(address governance, address operator, uint48 adminTransferDelay)
        external
        initializer
    {
        if (operator == address(0)) revert CreditErrors.ZeroAddress();
        __Governed_init(governance, adminTransferDelay);
        __ReentrancyGuard_init();
        _grantRole(OPERATOR_ROLE, operator);
    }

    /// @inheritdoc ISourceVault
    function lock() external payable override whenNotPaused notFrozen(msg.sender) {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
        balanceOf[msg.sender] += msg.value;
        emit CollateralLocked(msg.sender, msg.value, nonceOf[msg.sender]++);
    }

    /// @notice Clear collateral for withdrawal once the Creditcoin debt is settled.
    /// @dev Replaced by a proof once Attestcoin writability ships, which removes
    ///      the operator from the withdrawal path entirely.
    function approveRelease(address account, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (amount > balanceOf[account]) revert CreditErrors.InsufficientCollateral();
        releasable[account] = amount;
        emit ReleaseApproved(account, amount);
    }

    /// @inheritdoc ISourceVault
    function unlock(uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
        notFrozen(msg.sender)
    {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        uint256 allowed = releasable[msg.sender];
        if (amount > allowed) revert CreditErrors.InsufficientCollateral();

        releasable[msg.sender] = allowed - amount;
        balanceOf[msg.sender] -= amount;
        emit CollateralUnlocked(msg.sender, amount, nonceOf[msg.sender]++);

        Address.sendValue(payable(msg.sender), amount);
    }
}
