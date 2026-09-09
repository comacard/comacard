// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Which source-chain fact a proved transaction is being submitted for.
/// @dev Passed to `ASCBase.execute` as the `action` discriminator and routed in
///      `_processAndEmitEvent`. Values are part of the off-chain worker's ABI,
///      so existing entries must keep their ordinal.
enum CreditAction {
    CollateralLocked,
    CollateralUnlocked,
    HistoryImported
}

/// @notice Per-borrower state backing a revolving credit line.
/// @param collateral Value locked on the source chain and proved to Creditcoin.
/// @param drawn Currently outstanding principal.
/// @param drawnAt When the current cycle opened. Zero when nothing is drawn.
/// @param dueAt When the outstanding balance must be settled. Zero when nothing
///        is drawn.
/// @param provenNonce Highest transaction nonce proved for this account on the
///        history chain, i.e. how much of a track record it has elsewhere.
/// @param cycleCount Credit cycles concluded, by repayment or by default.
/// @param repayCount Cycles concluded by full repayment.
/// @param defaultCount Cycles concluded by default.
struct CreditAccount {
    uint256 collateral;
    uint256 drawn;
    uint64 drawnAt;
    uint64 dueAt;
    uint64 provenNonce;
    uint64 cycleCount;
    uint64 repayCount;
    uint64 defaultCount;
}

library CreditErrors {
    error Unauthorized(address caller);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientCollateral();
    error ExceedsAvailableCredit(uint256 requested, uint256 available);
    error NothingOutstanding();
    error RepaymentExceedsDebt(uint256 sent, uint256 outstanding);
    error OutstandingDebt(uint256 outstanding);
    error TransferFailed();
    error UnknownAction(uint8 action);
    error TransactionReverted();
    error NoMatchingEvent();
    error UntrustedEmitter(address emitter);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error NotOverdue(uint64 dueAt);
    error WrongAccount(address expected, address actual);
    error StaleHistory(uint64 known, uint64 offered);
    error TermOutOfRange(uint64 term);
    error DurationOutOfRange(uint64 duration);
    error WrongChain(uint64 expected, uint64 actual);
}
