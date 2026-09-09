// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {ASCBase} from "@gluwa/asc-contracts/contracts/readability/ASCBase.sol";

import {Governed} from "../governance/Governed.sol";
import {ICreditLine} from "../interfaces/ICreditLine.sol";
import {IYieldAdapter} from "../interfaces/IYieldAdapter.sol";
import {CreditScoring} from "../libraries/CreditScoring.sol";
import {HistoryProof} from "../libraries/HistoryProof.sol";
import {VaultEvents} from "../libraries/VaultEvents.sol";
import {CreditAccount, CreditAction, CreditErrors} from "../types/CreditTypes.sol";

/// @title ASCCreditLine
/// @notice A revolving credit line whose limit is derived from behaviour proved
///         on other chains rather than from a balance snapshot.
///
/// @dev Attestcoin proves transactions and their event logs — never balances or
///      contract storage — so every input to a credit decision here is a counted
///      event. `ASCBase` verifies the inclusion proof and rejects replays; this
///      contract only interprets what it is handed.
contract ASCCreditLine is ASCBase, ICreditLine, Governed, ReentrancyGuardUpgradeable {
    using CreditScoring for CreditAccount;

    /// @notice The SourceVault on the source chain whose events are honoured.
    address public sourceVault;

    /// @notice Creditcoin-internal id of the source chain (1 = Sepolia).
    uint64 public sourceChainKey;

    /// @notice Where idle liquidity earns while it waits to be drawn.
    IYieldAdapter public yieldAdapter;

    mapping(address => CreditAccount) internal _accounts;

    /// @notice Sum of all outstanding principal, for solvency checks.
    uint256 public totalDrawn;

    /// @notice Chain whose transaction history counts toward a score.
    /// @dev 1 = Ethereum mainnet. Pinned inside the proof, not taken on trust.
    uint64 public historyChainId;

    /// @notice How long a draw may stay outstanding before it can be defaulted.
    uint64 public term;

    /// @notice How long a cycle must stay open before it counts toward a score.
    /// @dev Without this, a borrower could open and close ten cycles in a single
    ///      block for the price of gas and walk away with a record they never
    ///      earned — then post real collateral against an inflated limit. A
    ///      cycle shorter than this still settles the debt, it just proves
    ///      nothing about the borrower.
    uint64 public minCycleDuration;

    uint64 internal constant MIN_TERM = 1 days;
    uint64 internal constant MAX_TERM = 365 days;
    uint64 internal constant MAX_CYCLE_DURATION = 30 days;

    event YieldAdapterChanged(address indexed from, address indexed to);
    event HistoryImported(address indexed account, uint64 provenNonce, bytes32 queryId);
    event Defaulted(address indexed account, uint256 writtenOff, uint256 collateralSeized);
    event TermChanged(uint64 from, uint64 to);
    event LiquidityDeployed(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param sourceVault_ SourceVault on the source chain whose events count.
    /// @param sourceChainKey_ Creditcoin-internal source chain id (1 = Sepolia).
    /// @param governance Multisig or timelock holding admin rights.
    /// @param operator Hot key that moves liquidity.
    /// @param adminTransferDelay Seconds a governance handover must wait.
    function initialize(
        address sourceVault_,
        uint64 sourceChainKey_,
        address governance,
        address operator,
        uint48 adminTransferDelay
    ) external initializer {
        if (sourceVault_ == address(0) || operator == address(0)) {
            revert CreditErrors.ZeroAddress();
        }
        __Governed_init(governance, adminTransferDelay);
        __ReentrancyGuard_init();
        sourceVault = sourceVault_;
        sourceChainKey = sourceChainKey_;
        historyChainId = 1;
        term = 30 days;
        minCycleDuration = 1 days;
        _grantRole(OPERATOR_ROLE, operator);
    }

    // --------------------------------------------------------------------
    // Attestcoin
    // --------------------------------------------------------------------

    /// @inheritdoc ASCBase
    /// @dev Reached only after `ASCBase.execute` has verified the Merkle and
    ///      continuity proofs and confirmed this query has not been seen before.
    function _processAndEmitEvent(uint8 action, bytes32 queryId, bytes memory encodedTransaction)
        internal
        override
    {
        if (action == uint8(CreditAction.CollateralLocked)) {
            _applyCollateral(queryId, encodedTransaction, true);
        } else if (action == uint8(CreditAction.CollateralUnlocked)) {
            _applyCollateral(queryId, encodedTransaction, false);
        } else if (action == uint8(CreditAction.HistoryImported)) {
            _importHistory(queryId, encodedTransaction);
        } else {
            revert CreditErrors.UnknownAction(action);
        }
    }

    function _applyCollateral(bytes32 queryId, bytes memory encodedTransaction, bool isLock)
        internal
    {
        VaultEvents.CollateralEvent[] memory events = VaultEvents.extract(
            encodedTransaction,
            isLock ? VaultEvents.COLLATERAL_LOCKED_SIG : VaultEvents.COLLATERAL_UNLOCKED_SIG,
            sourceVault
        );

        for (uint256 i = 0; i < events.length; ++i) {
            VaultEvents.CollateralEvent memory e = events[i];
            CreditAccount storage account = _accounts[e.account];

            if (isLock) {
                account.collateral += e.amount;
                emit CollateralCredited(e.account, e.amount, queryId);
            } else {
                if (e.amount > account.collateral) revert CreditErrors.InsufficientCollateral();
                account.collateral -= e.amount;
                // Releasing collateral must never strand outstanding debt.
                if (account.drawn > CreditScoring.limit(account)) {
                    revert CreditErrors.OutstandingDebt(account.drawn);
                }
                emit CollateralReleased(e.account, e.amount, queryId);
            }
        }
    }

    // --------------------------------------------------------------------
    // Borrowing
    // --------------------------------------------------------------------

    /// @inheritdoc ICreditLine
    /// @dev Guarded: `_ensureLiquidity` calls out to the yield adapter before
    ///      this function writes its own state, so without the guard a hostile
    ///      adapter could re-enter and draw twice against a single limit.
    function draw(uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
        notFrozen(msg.sender)
    {
        if (amount == 0) revert CreditErrors.ZeroAmount();

        CreditAccount storage account = _accounts[msg.sender];
        uint256 available = CreditScoring.available(account);
        if (amount > available) revert CreditErrors.ExceedsAvailableCredit(amount, available);

        _ensureLiquidity(amount);

        if (account.drawn == 0) {
            account.drawnAt = uint64(block.timestamp);
            account.dueAt = uint64(block.timestamp) + term;
        }
        account.drawn += amount;
        totalDrawn += amount;

        emit Drawn(msg.sender, amount, account.drawn, account.dueAt);

        Address.sendValue(payable(msg.sender), amount);
    }

    /// @inheritdoc ICreditLine
    /// @dev Only a repayment that clears the balance closes a credit cycle and
    ///      counts toward the score. Partial repayments reduce the debt but earn
    ///      no mark, so the record cannot be farmed a wei at a time.
    ///
    ///      Deliberately not pausable. A pause stops new borrowing, but a
    ///      borrower who cannot repay while the clock still runs would be
    ///      defaulted for something they had no way to prevent. Repaying only
    ///      ever reduces risk, so it stays open.
    function repay() external payable override nonReentrant {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();

        CreditAccount storage account = _accounts[msg.sender];
        uint256 outstanding = account.drawn;
        if (outstanding == 0) revert CreditErrors.NothingOutstanding();
        if (msg.value > outstanding) {
            revert CreditErrors.RepaymentExceedsDebt(msg.value, outstanding);
        }

        account.drawn = outstanding - msg.value;
        totalDrawn -= msg.value;
        if (account.drawn == 0) {
            // A cycle is scored when it closes, not when it opens: counting an
            // open draw would let borrowing shrink the very limit it was drawn
            // against, and a loan still in flight is evidence of nothing.
            bool earned = block.timestamp - account.drawnAt >= minCycleDuration;
            account.drawnAt = 0;
            account.dueAt = 0;
            if (earned) {
                account.cycleCount += 1;
                account.repayCount += 1;
            }
        }

        emit Repaid(msg.sender, msg.value, account.drawn);
    }

    /// @notice Credit an account with track record proved on the history chain.
    /// @dev The proof credits its own signer: the nonce is claimed for the
    ///      transaction's `from`, so nobody can import somebody else's history.
    ///      Only a higher nonce moves the needle, which makes replaying an old
    ///      transaction pointless rather than merely redundant.
    function _importHistory(bytes32 queryId, bytes memory encodedTransaction) internal {
        HistoryProof.Activity memory activity =
            HistoryProof.readActivity(encodedTransaction, historyChainId);

        CreditAccount storage account = _accounts[activity.account];
        if (activity.nonce <= account.provenNonce) {
            revert CreditErrors.StaleHistory(account.provenNonce, activity.nonce);
        }
        account.provenNonce = activity.nonce;
        emit HistoryImported(activity.account, activity.nonce, queryId);
    }

    // --------------------------------------------------------------------
    // Default
    // --------------------------------------------------------------------

    /// @notice Close an overdue position as a default.
    /// @dev Permissionless on purpose: a debt that everyone can see is overdue
    ///      should not wait on a privileged key to be recognised as such.
    ///
    ///      The write-down is bounded by the collateral actually recorded, and
    ///      the cycle is counted without a repayment — which is precisely how a
    ///      default costs the borrower their score, and with it their limit.
    ///
    ///      Seizing the collateral on the source chain is a separate, off-chain
    ///      step today: Attestcoin cannot yet write back, so the operator simply
    ///      never approves the release. `collateral` here is the accounting
    ///      record of that claim.
    function markDefaulted(address borrower) external whenNotPaused {
        CreditAccount storage account = _accounts[borrower];
        uint256 outstanding = account.drawn;
        if (outstanding == 0) revert CreditErrors.NothingOutstanding();
        if (account.dueAt == 0 || block.timestamp <= account.dueAt) {
            revert CreditErrors.NotOverdue(account.dueAt);
        }

        uint256 seized = outstanding > account.collateral ? account.collateral : outstanding;
        account.collateral -= seized;
        account.drawn = 0;
        account.drawnAt = 0;
        account.dueAt = 0;
        account.cycleCount += 1;
        account.defaultCount += 1;
        totalDrawn -= outstanding;

        emit Defaulted(borrower, outstanding, seized);
    }

    /// @notice How long a draw may stay outstanding before it can be defaulted.
    function setTerm(uint64 next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next < MIN_TERM || next > MAX_TERM) revert CreditErrors.TermOutOfRange(next);
        emit TermChanged(term, next);
        term = next;
    }

    /// @notice How long a cycle must stay open before it counts toward a score.
    function setMinCycleDuration(uint64 next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next > MAX_CYCLE_DURATION) revert CreditErrors.DurationOutOfRange(next);
        minCycleDuration = next;
    }

    /// @notice Whether a position is past its due date and may be defaulted.
    function isOverdue(address borrower) external view returns (bool) {
        CreditAccount storage account = _accounts[borrower];
        return account.drawn > 0 && account.dueAt != 0 && block.timestamp > account.dueAt;
    }

    // --------------------------------------------------------------------
    // Liquidity
    // --------------------------------------------------------------------

    /// @dev Pulls back from the yield adapter only when the buffer runs short,
    ///      so an ordinary draw does not disturb what is earning.
    function _ensureLiquidity(uint256 amount) private {
        uint256 balance = address(this).balance;
        if (balance >= amount) return;

        if (address(yieldAdapter) == address(0)) {
            revert CreditErrors.InsufficientLiquidity(amount, balance);
        }
        yieldAdapter.withdraw(amount - balance);

        if (address(this).balance < amount) {
            revert CreditErrors.InsufficientLiquidity(amount, address(this).balance);
        }
    }

    /// @notice Move idle liquidity into the yield adapter.
    function deployLiquidity(uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        if (address(yieldAdapter) == address(0)) revert CreditErrors.ZeroAddress();
        if (amount > address(this).balance) {
            revert CreditErrors.InsufficientLiquidity(amount, address(this).balance);
        }
        emit LiquidityDeployed(amount);
        yieldAdapter.deposit{value: amount}();
    }

    function setYieldAdapter(IYieldAdapter next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit YieldAdapterChanged(address(yieldAdapter), address(next));
        yieldAdapter = next;
    }

    /// @notice Seed the lending pool.
    function fund() external payable {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
    }

    // --------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------

    /// @inheritdoc ICreditLine
    function limitOf(address account) external view override returns (uint256) {
        return CreditScoring.limit(_accounts[account]);
    }

    /// @inheritdoc ICreditLine
    function availableOf(address account) external view override returns (uint256) {
        return CreditScoring.available(_accounts[account]);
    }

    /// @inheritdoc ICreditLine
    function scoreOf(address account) external view override returns (uint256) {
        return CreditScoring.score(_accounts[account]);
    }

    /// @inheritdoc ICreditLine
    function accountOf(address account) external view override returns (CreditAccount memory) {
        return _accounts[account];
    }

    /// @dev Accepts returns from the yield adapter.
    receive() external payable {}
}
