// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IWormhole} from "../interfaces/IWormhole.sol";
import {CollateralMessage} from "../libraries/CollateralMessage.sol";

/// @title WormholeVault
/// @notice Collateral custody on any chain Wormhole reaches. Holds the deposit
///         and publishes a message saying so; the credit line on Creditcoin
///         reads that message and extends credit against it.
///
/// @dev One contract, deployed per chain. Attestcoin proves transactions from
///      Ethereum and Sepolia and nothing else, so every other chain needs a
///      different carrier — this is it. The asset itself never moves: only the
///      message crosses, which is the same promise the Attestcoin path makes.
///
///      Deliberately not upgradeable. It is deployed once per chain and its job
///      is small; a proxy on every chain is machinery to maintain in exchange
///      for flexibility a vault this simple does not need.
contract WormholeVault is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The chain's own Wormhole Core Contract.
    IWormhole public immutable WORMHOLE;

    /// @notice How final a message must be before guardians sign it.
    /// @dev 1 is "finalized". Anything less trades a wrong answer for speed,
    ///      and this answer decides how much someone may borrow.
    uint8 public constant CONSISTENCY_FINALIZED = 1;

    /// @notice Authorised to clear withdrawals against settled debt.
    address public operator;

    /// @notice Tokens accepted here. The native coin is always accepted.
    mapping(address => bool) public supportedToken;

    /// @notice Native collateral held per account.
    mapping(address => uint256) public nativeBalanceOf;

    /// @notice Token collateral held per account, per token.
    mapping(address => mapping(address => uint256)) public tokenBalanceOf;

    /// @notice Collateral the operator has cleared for withdrawal.
    mapping(address => uint256) public nativeReleasable;
    mapping(address => mapping(address => uint256)) public tokenReleasable;

    event Locked(address indexed account, address indexed token, uint256 amount, uint64 sequence);
    event Unlocked(address indexed account, address indexed token, uint256 amount);
    event ReleaseApproved(address indexed account, address indexed token, uint256 amount);
    event TokenSupportChanged(address indexed token, bool supported);
    event OperatorChanged(address indexed from, address indexed to);

    error NothingToLock();
    error TokenNotSupported(address token);
    error NotOperator(address caller);
    error NotReleasable(uint256 allowed, uint256 requested);
    error FeeNotCovered(uint256 required, uint256 sent);

    modifier onlyOperator() {
        _onlyOperator();
        _;
    }

    function _onlyOperator() private view {
        if (msg.sender != operator) revert NotOperator(msg.sender);
    }

    constructor(address wormhole, address governance, address operator_) Ownable(governance) {
        WORMHOLE = IWormhole(wormhole);
        operator = operator_;
    }

    // --------------------------------------------------------------------
    // Locking
    // --------------------------------------------------------------------

    /// @notice Lock the chain's native coin as collateral.
    /// @dev Wormhole charges a fee to publish, taken from the same `msg.value`.
    ///      Crediting the full amount and paying the fee from it would credit
    ///      collateral the vault does not hold, so the fee comes off first.
    function lockNative() external payable nonReentrant returns (uint64 sequence) {
        uint256 fee = WORMHOLE.messageFee();
        if (msg.value <= fee) revert FeeNotCovered(fee, msg.value);

        uint256 amount = msg.value - fee;
        nativeBalanceOf[msg.sender] += amount;

        sequence = _publish(msg.sender, bytes32(0), amount, 18, fee);
        emit Locked(msg.sender, address(0), amount, sequence);
    }

    /// @notice Lock an accepted ERC20 as collateral.
    /// @dev Credits what arrived rather than what was asked for, so a
    ///      fee-on-transfer token cannot claim collateral it never delivered.
    function lockToken(address token, uint256 amount)
        external
        payable
        nonReentrant
        returns (uint64 sequence)
    {
        if (!supportedToken[token]) revert TokenNotSupported(token);
        if (amount == 0) revert NothingToLock();

        uint256 fee = WORMHOLE.messageFee();
        if (msg.value < fee) revert FeeNotCovered(fee, msg.value);

        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;

        tokenBalanceOf[msg.sender][token] += received;

        sequence = _publish(
            msg.sender,
            bytes32(uint256(uint160(token))),
            received,
            IERC20Metadata(token).decimals(),
            fee
        );
        emit Locked(msg.sender, token, received, sequence);
    }

    function _publish(address account, bytes32 token, uint256 amount, uint8 decimals, uint256 fee)
        private
        returns (uint64)
    {
        bytes memory payload = CollateralMessage.encode(
            CollateralMessage.Deposit({
                account: account, token: token, amount: amount, decimals: decimals
            })
        );
        return WORMHOLE.publishMessage{value: fee}(0, payload, CONSISTENCY_FINALIZED);
    }

    // --------------------------------------------------------------------
    // Withdrawal
    // --------------------------------------------------------------------

    /// @notice Clear collateral for withdrawal once the debt is settled.
    /// @dev Operator-gated, the same as the Attestcoin vault and for the same
    ///      reason: Creditcoin cannot yet send a message back that this chain
    ///      would accept. Wormhole could carry one, and that is the next thing
    ///      to build; until then a person decides.
    function approveRelease(address account, address token, uint256 amount) external onlyOperator {
        if (token == address(0)) {
            nativeReleasable[account] = amount;
        } else {
            tokenReleasable[account][token] = amount;
        }
        emit ReleaseApproved(account, token, amount);
    }

    function unlockNative(uint256 amount) external nonReentrant {
        uint256 allowed = nativeReleasable[msg.sender];
        if (amount == 0 || amount > allowed) revert NotReleasable(allowed, amount);

        nativeReleasable[msg.sender] = allowed - amount;
        nativeBalanceOf[msg.sender] -= amount;
        emit Unlocked(msg.sender, address(0), amount);

        Address.sendValue(payable(msg.sender), amount);
    }

    function unlockToken(address token, uint256 amount) external nonReentrant {
        uint256 allowed = tokenReleasable[msg.sender][token];
        if (amount == 0 || amount > allowed) revert NotReleasable(allowed, amount);

        tokenReleasable[msg.sender][token] = allowed - amount;
        tokenBalanceOf[msg.sender][token] -= amount;
        emit Unlocked(msg.sender, token, amount);

        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // --------------------------------------------------------------------
    // Administration
    // --------------------------------------------------------------------

    function setSupportedToken(address token, bool supported) external onlyOwner {
        supportedToken[token] = supported;
        emit TokenSupportChanged(token, supported);
    }

    function setOperator(address next) external onlyOwner {
        emit OperatorChanged(operator, next);
        operator = next;
    }
}
