// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {Governed} from "../governance/Governed.sol";
import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";
import {CreditErrors} from "../types/CreditTypes.sol";

/// @title CtcStakingAdapter
/// @notice Puts idle credit-line liquidity to work in Creditcoin's native
///         Nominated Proof-of-Stake, so a balance waiting to be drawn still earns.
///
/// @dev **This adapter is custodial by necessity, not by choice.**
///
///      Creditcoin runs Substrate and EVM side by side, but bonding CTC is a
///      Substrate operation: the docs state that Substrate accounts are required
///      to participate in NPoS, while "only EVM accounts can interact with smart
///      contracts". There is no staking precompile — the published list covers
///      cryptographic primitives, signature verifiers and `SubstrateTransfer`
///      (a balance transfer), and nothing that can bond or nominate.
///
///      So a contract cannot stake. What it can do is move CTC to a Substrate
///      account's associated EVM address and account for what comes back. The
///      operator bonds, nominates and claims on the Substrate side; every
///      movement is recorded here so the shortfall is always visible on chain.
///
///      `deployedPrincipal` is the exact size of that trust. When a staking
///      precompile ships, a trustless adapter implements the same interface and
///      the credit line never learns the difference.
contract CtcStakingAdapter is IYieldAdapter, Governed, ReentrancyGuardUpgradeable {
    /// @notice The credit line allowed to deposit and withdraw.
    address public creditLine;

    /// @notice Substrate-associated EVM address funds are sent to for bonding.
    address public stakingAccount;

    uint256 public override deployedPrincipal;

    /// @notice Rewards returned by the operator, over and above principal.
    uint256 public accruedRewards;

    event Delegated(address indexed stakingAccount, uint256 amount);
    event PrincipalReturned(uint256 amount);
    event RewardsReported(uint256 amount);
    event StakingAccountChanged(address indexed from, address indexed to);

    modifier onlyCreditLine() {
        _onlyCreditLine();
        _;
    }

    function _onlyCreditLine() internal view {
        if (msg.sender != creditLine) revert CreditErrors.Unauthorized(msg.sender);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address creditLine_,
        address governance,
        address operator,
        address stakingAccount_,
        uint48 adminTransferDelay
    ) external initializer {
        if (creditLine_ == address(0) || operator == address(0)) {
            revert CreditErrors.ZeroAddress();
        }
        __Governed_init(governance, adminTransferDelay);
        __ReentrancyGuard_init();
        creditLine = creditLine_;
        stakingAccount = stakingAccount_;
        _grantRole(OPERATOR_ROLE, operator);
    }

    /// @inheritdoc IYieldAdapter
    function idleBalance() public view override returns (uint256) {
        return address(this).balance;
    }

    /// @inheritdoc IYieldAdapter
    function totalAssets() external view override returns (uint256) {
        return idleBalance() + deployedPrincipal;
    }

    /// @inheritdoc IYieldAdapter
    function deposit() external payable override onlyCreditLine {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
        emit Deposited(msg.sender, msg.value);
    }

    /// @inheritdoc IYieldAdapter
    /// @dev Only idle liquidity can be returned synchronously. Bonded CTC is
    ///      subject to Creditcoin's unbonding period, so the credit line must
    ///      keep a working buffer rather than assume instant liquidity.
    function withdraw(uint256 amount) external override onlyCreditLine returns (uint256 withdrawn) {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        uint256 idle = idleBalance();
        withdrawn = amount > idle ? idle : amount;
        if (withdrawn == 0) revert CreditErrors.InsufficientLiquidity(amount, 0);

        emit Withdrawn(msg.sender, withdrawn);
        Address.sendValue(payable(creditLine), withdrawn);
    }

    /// @notice Send idle liquidity to the Substrate account for bonding.
    function delegate(uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        if (amount > idleBalance()) {
            revert CreditErrors.InsufficientLiquidity(amount, idleBalance());
        }
        if (stakingAccount == address(0)) revert CreditErrors.ZeroAddress();

        deployedPrincipal += amount;
        emit Delegated(stakingAccount, amount);

        Address.sendValue(payable(stakingAccount), amount);
    }

    /// @notice Return bonded principal after unbonding completes.
    function returnPrincipal() external payable onlyRole(OPERATOR_ROLE) {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
        uint256 credited = msg.value > deployedPrincipal ? deployedPrincipal : msg.value;
        deployedPrincipal -= credited;

        uint256 surplus = msg.value - credited;
        if (surplus > 0) {
            accruedRewards += surplus;
            emit RewardsReported(surplus);
        }
        emit PrincipalReturned(credited);
    }

    /// @notice Deliver staking rewards claimed on the Substrate side.
    function reportRewards() external payable onlyRole(OPERATOR_ROLE) {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
        accruedRewards += msg.value;
        emit RewardsReported(msg.value);
    }

    function setStakingAccount(address next) external onlyRole(OPERATOR_ROLE) {
        emit StakingAccountChanged(stakingAccount, next);
        stakingAccount = next;
    }
}
