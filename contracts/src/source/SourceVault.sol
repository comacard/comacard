// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    mapping(address => uint256) public override balanceOf;
    mapping(address => uint256) public override nonceOf;

    /// @notice Collateral the operator has cleared for withdrawal.
    mapping(address => uint256) public releasable;

    // ---- ERC20 collateral. Appended: the slots above hold live state. ----

    /// @notice Tokens this vault will accept as collateral.
    mapping(address => bool) public supportedToken;

    /// @notice Token collateral held per account, per token.
    mapping(address => mapping(address => uint256)) public tokenBalanceOf;

    /// @notice Token collateral the operator has cleared for withdrawal.
    mapping(address => mapping(address => uint256)) public tokenReleasable;

    event ReleaseApproved(address indexed account, uint256 amount);

    /// @dev Kept distinct from CollateralLocked on purpose. Creditcoin selects
    ///      logs by signature, so a token lock must never be mistakable for a
    ///      native one — the amounts are in different units.
    event TokenLocked(
        address indexed account, address indexed token, uint256 amount, uint256 nonce
    );
    event TokenUnlocked(
        address indexed account, address indexed token, uint256 amount, uint256 nonce
    );
    event TokenSupportChanged(address indexed token, bool supported);
    event TokenReleaseApproved(address indexed account, address indexed token, uint256 amount);

    error TokenNotSupported(address token);

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
    /// @dev Sets the allowance, it does not add to it. The operator must pass
    ///      the borrower's whole `pendingRelease` from the credit line, never
    ///      the increment of one hold — two holds approved separately would
    ///      leave the second overwriting the first, and the borrower short by
    ///      the difference with the collateral already debited on Creditcoin.
    ///
    ///      Set rather than add is deliberate here, because a human reconciling
    ///      against a figure wants the call to be idempotent. `ReleaseRelay`
    ///      faces the same vault API on the Wormhole side and has the opposite
    ///      need, so it reads the outstanding allowance and adds to it itself.
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

    // --------------------------------------------------------------------
    // ERC20 collateral
    // --------------------------------------------------------------------

    /// @notice Allow or refuse a token as collateral.
    /// @dev Governance, not the operator: which assets back credit is a
    ///      question of what the protocol is willing to be exposed to.
    function setSupportedToken(address token, bool supported)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (token == address(0)) revert CreditErrors.ZeroAddress();
        supportedToken[token] = supported;
        emit TokenSupportChanged(token, supported);
    }

    /// @notice Lock ERC20 collateral. The tokens stay here, on this chain.
    /// @dev Credits what actually arrived rather than what was asked for, so a
    ///      fee-on-transfer token cannot credit more collateral than it
    ///      delivered.
    function lockToken(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        notFrozen(msg.sender)
    {
        if (!supportedToken[token]) revert TokenNotSupported(token);
        if (amount == 0) revert CreditErrors.ZeroAmount();

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;

        tokenBalanceOf[msg.sender][token] += received;
        emit TokenLocked(msg.sender, token, received, nonceOf[msg.sender]++);
    }

    /// @notice Clear token collateral for withdrawal once the debt is settled.
    function approveTokenRelease(address account, address token, uint256 amount)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (amount > tokenBalanceOf[account][token]) {
            revert CreditErrors.InsufficientCollateral();
        }
        tokenReleasable[account][token] = amount;
        emit TokenReleaseApproved(account, token, amount);
    }

    /// @notice Withdraw token collateral the operator has cleared.
    function unlockToken(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        notFrozen(msg.sender)
    {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        uint256 allowed = tokenReleasable[msg.sender][token];
        if (amount > allowed) revert CreditErrors.InsufficientCollateral();

        tokenReleasable[msg.sender][token] = allowed - amount;
        tokenBalanceOf[msg.sender][token] -= amount;
        emit TokenUnlocked(msg.sender, token, amount, nonceOf[msg.sender]++);

        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
