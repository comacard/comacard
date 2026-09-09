// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Which source-chain event a proved transaction is being submitted for.
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
/// @param borrowCount Draws taken over the account's lifetime.
/// @param repayCount Repayments completed over the account's lifetime.
/// @param firstSeenAt Timestamp of the earliest attested activity, the anchor
///        for credit history depth.
struct CreditAccount {
    uint256 collateral;
    uint256 drawn;
    uint64 borrowCount;
    uint64 repayCount;
    uint64 firstSeenAt;
}

library CreditErrors {
    error Unauthorized(address caller);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientCollateral();
    error InsufficientBalance();
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
}
