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

    /// @notice What one whole unit of the collateral asset is worth in the asset
    ///         this line lends, as 18-decimal fixed point.
    /// @dev Collateral is ETH locked on Sepolia; a draw pays out native CTC on
    ///      Creditcoin. Without this the limit was a ratio between two unrelated
    ///      balances — one wei of ETH counted as one wei of CTC. Operator-fed
    ///      for now: Attestcoin proves transactions, not prices, and Creditcoin
    ///      has no price feed, so there is nothing trustless to read yet.
    uint256 public collateralPrice;

    uint256 internal constant PRICE_SCALE = 1e18;

    // ---- ERC20 collateral. Appended: every slot above holds live state. ----

    /// @notice How the protocol values one listed token.
    /// @param price Credit-asset wei per ONE WHOLE token, 18-decimal fixed point.
    /// @param decimals The token's own decimals, needed to know what "one whole
    ///        token" is. A 6-decimal stablecoin priced as if it had 18 would be
    ///        valued at a trillionth of its worth.
    struct TokenConfig {
        uint256 price;
        uint8 decimals;
        bool listed;
    }

    /// @notice Every listed token, so collateral value can be summed across them.
    address[] internal _tokens;

    mapping(address => TokenConfig) public tokenConfig;

    /// @notice Token collateral proved per account, keyed by source-chain token.
    mapping(address => mapping(address => uint256)) public tokenCollateral;

    /// @notice Token collateral already debited ahead of its source-chain release.
    mapping(address => mapping(address => uint256)) public tokenPendingRelease;

    /// @notice Listing more than this would make every limit check loop too far.
    uint256 internal constant MAX_TOKENS = 16;

    uint64 internal constant MIN_TERM = 1 days;
    uint64 internal constant MAX_TERM = 365 days;
    uint64 internal constant MAX_CYCLE_DURATION = 30 days;

    event YieldAdapterChanged(address indexed from, address indexed to);
    event HistoryImported(address indexed account, uint64 provenNonce, bytes32 indexed queryId);
    event Defaulted(address indexed account, uint256 writtenOff, uint256 collateralSeized);
    event TermChanged(uint64 from, uint64 to);
    event CollateralPriceChanged(uint256 from, uint256 to);
    event TokenListed(address indexed token, uint8 decimals, uint256 price);
    event TokenPriceChanged(address indexed token, uint256 from, uint256 to);
    event TokenCollateralCredited(
        address indexed account, address indexed token, uint256 amount, bytes32 indexed queryId
    );
    event TokenCollateralReleased(
        address indexed account, address indexed token, uint256 amount, bytes32 indexed queryId
    );
    event TokenReleaseHeld(
        address indexed account, address indexed token, uint256 amount, uint256 pending
    );
    event ReleaseHeld(address indexed account, uint256 amount, uint256 pending);
    event LiquidityWithdrawn(address indexed to, uint256 amount);

    /// @notice Emitted whenever anything that moves a score actually moves it.
    /// @dev Saves every indexer and frontend from reimplementing CreditScoring
    ///      and drifting from it. The chain stays the single source of truth for
    ///      what a borrower may draw.
    event ScoreChanged(address indexed account, uint256 score, uint256 limit, uint256 available);
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
        collateralPrice = PRICE_SCALE; // parity until an oracle prices it
        _grantRole(ORACLE_ROLE, operator);
        _grantRole(OPERATOR_ROLE, operator);
    }

    /// @notice Sets the collateral price when upgrading from the version that
    ///         had none. Called atomically by `upgradeToAndCall`, because a
    ///         proxy that lands on this code without a price prices every
    ///         account's collateral at zero.
    function initializeV2(address oracle, uint256 price) external reinitializer(2) {
        if (oracle == address(0)) revert CreditErrors.ZeroAddress();
        if (price == 0) revert CreditErrors.ZeroAmount();
        _grantRole(ORACLE_ROLE, oracle);
        emit CollateralPriceChanged(0, price);
        collateralPrice = price;
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
        } else if (action == uint8(CreditAction.TokenLocked)) {
            _applyTokenCollateral(queryId, encodedTransaction, true);
        } else if (action == uint8(CreditAction.TokenUnlocked)) {
            _applyTokenCollateral(queryId, encodedTransaction, false);
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
                _publishScore(e.account);
            } else {
                // A hold placed before the source-chain release already debited
                // this collateral. Consume it first so the arriving proof does
                // not debit the same funds twice.
                uint256 held = account.pendingRelease;
                uint256 consumed = e.amount > held ? held : e.amount;
                account.pendingRelease = held - consumed;

                uint256 remainder = e.amount - consumed;
                if (remainder > 0) {
                    if (remainder > account.collateral) {
                        revert CreditErrors.InsufficientCollateral();
                    }
                    account.collateral -= remainder;
                    // Releasing collateral must never strand outstanding debt.
                    if (
                        account.drawn
                            > CreditScoring.limitFrom(_collateralValue(e.account), account)
                    ) {
                        revert CreditErrors.OutstandingDebt(account.drawn);
                    }
                }
                emit CollateralReleased(e.account, e.amount, queryId);
                _publishScore(e.account);
            }
        }
    }

    /// @notice All posted collateral — native and every listed token — valued in
    ///         the asset the line lends.
    /// @dev Each token is scaled by its own decimals before pricing. That is the
    ///      whole difference between a correct limit and one that is off by
    ///      twelve orders of magnitude for a 6-decimal stablecoin.
    function _collateralValue(address who) internal view returns (uint256 value) {
        value = (_accounts[who].collateral * collateralPrice) / PRICE_SCALE;
        for (uint256 i = 0; i < _tokens.length; ++i) {
            address token = _tokens[i];
            uint256 held = tokenCollateral[who][token];
            if (held == 0) continue;
            TokenConfig storage cfg = tokenConfig[token];
            value += (held * cfg.price) / (10 ** cfg.decimals);
        }
    }

    /// @notice Price one whole unit of the collateral asset in the credit asset.
    function setCollateralPrice(uint256 next) external onlyRole(ORACLE_ROLE) {
        if (next == 0) revert CreditErrors.ZeroAmount();
        emit CollateralPriceChanged(collateralPrice, next);
        collateralPrice = next;
    }

    /// @dev Publishes the derived view of an account after anything that can
    ///      change it, so consumers never have to recompute the maths.
    function _publishScore(address borrower) internal {
        CreditAccount storage account = _accounts[borrower];
        emit ScoreChanged(
            borrower,
            CreditScoring.score(account),
            CreditScoring.limitFrom(_collateralValue(borrower), account),
            CreditScoring.availableFrom(_collateralValue(borrower), account)
        );
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
        uint256 available = CreditScoring.availableFrom(_collateralValue(msg.sender), account);
        if (amount > available) revert CreditErrors.ExceedsAvailableCredit(amount, available);

        _ensureLiquidity(amount);

        if (account.drawn == 0) {
            account.drawnAt = uint64(block.timestamp);
            account.dueAt = uint64(block.timestamp) + term;
        }
        account.drawn += amount;
        totalDrawn += amount;

        emit Drawn(msg.sender, amount, account.drawn, account.dueAt);
        _publishScore(msg.sender);

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
        _publishScore(msg.sender);
    }

    /// @notice Credit or debit token collateral from a proved SourceVault event.
    /// @dev An unlisted token is refused rather than credited at zero: silently
    ///      accepting it would record collateral the line cannot price, and the
    ///      borrower would reasonably believe it counted.
    function _applyTokenCollateral(bytes32 queryId, bytes memory encodedTransaction, bool isLock)
        internal
    {
        VaultEvents.TokenEvent[] memory events = VaultEvents.extractToken(
            encodedTransaction,
            isLock ? VaultEvents.TOKEN_LOCKED_SIG : VaultEvents.TOKEN_UNLOCKED_SIG,
            sourceVault
        );

        for (uint256 i = 0; i < events.length; ++i) {
            VaultEvents.TokenEvent memory e = events[i];
            if (!tokenConfig[e.token].listed) revert CreditErrors.TokenNotListed(e.token);

            if (isLock) {
                tokenCollateral[e.account][e.token] += e.amount;
                emit TokenCollateralCredited(e.account, e.token, e.amount, queryId);
            } else {
                // Consume a hold first, exactly as native collateral does, so an
                // unlock proof arriving after the hold does not debit twice.
                uint256 held = tokenPendingRelease[e.account][e.token];
                uint256 consumed = e.amount > held ? held : e.amount;
                tokenPendingRelease[e.account][e.token] = held - consumed;

                uint256 remainder = e.amount - consumed;
                if (remainder > 0) {
                    if (remainder > tokenCollateral[e.account][e.token]) {
                        revert CreditErrors.InsufficientCollateral();
                    }
                    tokenCollateral[e.account][e.token] -= remainder;
                    CreditAccount storage account = _accounts[e.account];
                    if (
                        account.drawn
                            > CreditScoring.limitFrom(_collateralValue(e.account), account)
                    ) revert CreditErrors.OutstandingDebt(account.drawn);
                }
                emit TokenCollateralReleased(e.account, e.token, e.amount, queryId);
            }
            _publishScore(e.account);
        }
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
        _publishScore(activity.account);
    }

    /// @notice Debit collateral here *before* it is released on the source chain.
    ///
    /// @dev Closes a race that is otherwise unavoidable. Releasing collateral
    ///      takes three steps — the operator approves on the source chain, the
    ///      borrower withdraws, and only then does the proof reach Creditcoin.
    ///      Until that proof lands this contract still counts collateral the
    ///      borrower no longer has, and a draw in that window would be backed by
    ///      nothing. Placing the hold first makes the credit disappear before
    ///      the collateral does.
    ///
    ///      The arriving unlock proof consumes the hold rather than debiting
    ///      again, so the order the two arrive in does not matter.
    function placeReleaseHold(address borrower, uint256 amount) external onlyRole(OPERATOR_ROLE) {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        CreditAccount storage account = _accounts[borrower];
        if (amount > account.collateral) revert CreditErrors.InsufficientCollateral();

        account.collateral -= amount;
        account.pendingRelease += amount;

        uint256 remainingLimit = CreditScoring.limitFrom(_collateralValue(borrower), account);
        if (account.drawn > remainingLimit) {
            revert CreditErrors.ReleaseWouldStrandDebt(account.drawn, remainingLimit);
        }
        emit ReleaseHeld(borrower, amount, account.pendingRelease);
        _publishScore(borrower);
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
        _publishScore(borrower);
    }

    /// @notice Accept a source-chain token as collateral, with its decimals.
    /// @dev Listing is governance: it decides what the protocol is exposed to.
    ///      Repricing afterwards is the oracle's job, not governance's.
    function listToken(address token, uint8 decimals, uint256 price)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (token == address(0)) revert CreditErrors.ZeroAddress();
        if (tokenConfig[token].listed) revert CreditErrors.TokenAlreadyListed(token);
        if (decimals > 36) revert CreditErrors.DecimalsOutOfRange(decimals);
        if (price == 0) revert CreditErrors.ZeroAmount();
        if (_tokens.length >= MAX_TOKENS) revert CreditErrors.TokenNotListed(token);

        tokenConfig[token] = TokenConfig({price: price, decimals: decimals, listed: true});
        _tokens.push(token);
        emit TokenListed(token, decimals, price);
    }

    /// @notice Reprice a listed token, in credit-asset wei per whole token.
    function setTokenPrice(address token, uint256 price) external onlyRole(ORACLE_ROLE) {
        TokenConfig storage cfg = tokenConfig[token];
        if (!cfg.listed) revert CreditErrors.TokenNotListed(token);
        if (price == 0) revert CreditErrors.ZeroAmount();
        emit TokenPriceChanged(token, cfg.price, price);
        cfg.price = price;
    }

    /// @notice Debit token collateral here before it is released on Sepolia.
    /// @dev The same race as native collateral, closed the same way: the credit
    ///      has to disappear before the tokens can leave the vault.
    function placeTokenReleaseHold(address borrower, address token, uint256 amount)
        external
        onlyRole(OPERATOR_ROLE)
    {
        if (amount == 0) revert CreditErrors.ZeroAmount();
        uint256 held = tokenCollateral[borrower][token];
        if (amount > held) revert CreditErrors.InsufficientCollateral();

        tokenCollateral[borrower][token] = held - amount;
        tokenPendingRelease[borrower][token] += amount;

        CreditAccount storage account = _accounts[borrower];
        uint256 remainingLimit = CreditScoring.limitFrom(_collateralValue(borrower), account);
        if (account.drawn > remainingLimit) {
            revert CreditErrors.ReleaseWouldStrandDebt(account.drawn, remainingLimit);
        }
        emit TokenReleaseHeld(borrower, token, amount, tokenPendingRelease[borrower][token]);
        _publishScore(borrower);
    }

    /// @notice Every token the line accepts, in listing order.
    function listedTokens() external view returns (address[] memory) {
        return _tokens;
    }

    /// @notice Total collateral value for an account, in the credit asset.
    function collateralValueOf(address account) external view returns (uint256) {
        return _collateralValue(account);
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

    /// @notice Seed the lending pool. Open to anyone.
    function fund() external payable {
        if (msg.value == 0) revert CreditErrors.ZeroAmount();
    }

    /// @notice Recover idle liquidity from the pool.
    /// @dev Without this, everything ever sent to `fund` is stranded: draws only
    ///      ever pay out against a limit, so there is no other way back. Drawn
    ///      principal has already left the contract, so this can only ever move
    ///      what is genuinely idle.
    function withdrawLiquidity(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (to == address(0)) revert CreditErrors.ZeroAddress();
        if (amount == 0) revert CreditErrors.ZeroAmount();
        if (amount > address(this).balance) {
            revert CreditErrors.InsufficientLiquidity(amount, address(this).balance);
        }
        emit LiquidityWithdrawn(to, amount);
        Address.sendValue(payable(to), amount);
    }

    // --------------------------------------------------------------------
    // Views
    // --------------------------------------------------------------------

    /// @inheritdoc ICreditLine
    function limitOf(address account) external view override returns (uint256) {
        return CreditScoring.limitFrom(_collateralValue(account), _accounts[account]);
    }

    /// @inheritdoc ICreditLine
    function availableOf(address account) external view override returns (uint256) {
        return CreditScoring.availableFrom(_collateralValue(account), _accounts[account]);
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
