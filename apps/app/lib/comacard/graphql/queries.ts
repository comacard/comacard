/**
 * Every document the app sends to the indexer, in one place so the shapes can be checked against
 * `apps/indexer/schema.graphql` by reading rather than by grepping call sites.
 *
 * Envio lowercases the account id, so every `$wallet` variable must be lowercased by the caller.
 * A checksummed address silently matches nothing.
 */

/** Fields of `Account` the app actually reads. Kept in one constant so the two documents that
 *  select an account cannot drift apart. */
const ACCOUNT_FIELDS = `
  id
  collateral
  drawn
  pendingRelease
  provenNonce
  score
  creditLimit
  available
  cycleCount
  repayCount
  defaultCount
  totalDrawn
  totalRepaid
  dueAt
  firstSeenAt
  lastActiveAt
`;

/**
 * The account as the indexer last saw it, plus the proofs that have landed for it.
 *
 * `score`, `creditLimit` and `available` here are as of the account's last on-chain activity, NOT
 * as of now: repricing collateral moves every limit at once without an event per account. Use
 * `GET /account/:wallet` for a live limit and this for history. The schema says the same thing.
 */
export const ACCOUNT_WITH_PROOFS = `
query AccountWithProofs($wallet: String!) {
  Account(where: { id: { _eq: $wallet } }) { ${ACCOUNT_FIELDS} }
  Attestation(
    where: { account: { _eq: $wallet } }
    order_by: { timestamp: desc }
    limit: 20
  ) { id kind amount provenNonce blockNumber timestamp txHash }
}
`;

/**
 * Locks observed on Sepolia, newest first.
 *
 * This is the source-chain side of the crossing. A lock appears here within seconds of the Sepolia
 * transaction, because Sepolia is on HyperSync. It does NOT mean the collateral counts on
 * Creditcoin yet; that is the Attestation below.
 */
export const COLLATERAL_LOCKS = `
query CollateralLocks($wallet: String!, $limit: Int = 20) {
  CollateralLock(
    where: { account_id: { _eq: $wallet } }
    order_by: { timestamp: desc }
    limit: $limit
  ) { id amount nonce released blockNumber timestamp txHash }
}
`;

/**
 * Has this wallet's collateral finished crossing?
 *
 * The screen that waits on a lock polls this. `collateral_credited` is emitted by the credit line
 * only after Attestcoin has verified the Sepolia transaction, which runs seven to nine minutes
 * behind the source chain. Comparing `timestamp` against the lock's own timestamp is how the app
 * tells "your new lock has landed" from "an older one already had".
 */
export const LATEST_CREDIT_ATTESTATION = `
query LatestCreditAttestation($wallet: String!) {
  Attestation(
    where: { account: { _eq: $wallet }, kind: { _eq: "collateral_credited" } }
    order_by: { timestamp: desc }
    limit: 1
  ) { id amount blockNumber timestamp txHash }
}
`;

/** Draws and repayments, for the credit-cycle screen. Collateral events live in the two documents
 *  above, because they belong to a different chain and a different waiting story. */
export const CREDIT_HISTORY = `
query CreditHistory($wallet: String!, $limit: Int = 25) {
  Draw(
    where: { account_id: { _eq: $wallet } }
    order_by: { timestamp: desc }
    limit: $limit
  ) { id amount outstandingAfter dueAt blockNumber timestamp txHash }
  Repayment(
    where: { account_id: { _eq: $wallet } }
    order_by: { timestamp: desc }
    limit: $limit
  ) { id amount outstandingAfter settled blockNumber timestamp txHash }
  Default(
    where: { account_id: { _eq: $wallet } }
    order_by: { timestamp: desc }
    limit: $limit
  ) { id writtenOff collateralSeized blockNumber timestamp txHash }
}
`;

/**
 * Protocol-wide numbers.
 *
 * `collateralPrice` and `pricedAt` are in `apps/indexer/schema.graphql` but are deliberately NOT
 * selected here: the deployed Envio indexer predates them and answers `field 'collateralPrice' not
 * found in type: 'Protocol'`, which fails the whole query, not just that field. Add them once the
 * indexer is redeployed. Until then the live price comes from `GET /protocol` on the API, which
 * reads it straight off the contract and is more current anyway.
 */
export const PROTOCOL = `
query Protocol {
  Protocol {
    accounts
    totalCollateral
    outstanding
    lifetimeDrawn
    lifetimeRepaid
    lifetimeDefaulted
    defaultCount
  }
}
`;

/**
 * Everything that has happened to one wallet, in a single round trip.
 *
 * Five row types across two chains. They are fetched together rather than as five queries because
 * the feed interleaves them by timestamp: fetching separately means five loading states for one
 * list, and rows that pop in out of order.
 */
export const WALLET_TRANSACTIONS = `
query WalletTransactions($wallet: String!, $limit: Int = 30) {
  Draw(where: { account_id: { _eq: $wallet } }, order_by: { timestamp: desc }, limit: $limit) {
    id amount outstandingAfter dueAt timestamp txHash
  }
  Repayment(where: { account_id: { _eq: $wallet } }, order_by: { timestamp: desc }, limit: $limit) {
    id amount outstandingAfter settled timestamp txHash
  }
  CollateralLock(where: { account_id: { _eq: $wallet } }, order_by: { timestamp: desc }, limit: $limit) {
    id amount nonce released timestamp txHash
  }
  Default(where: { account_id: { _eq: $wallet } }, order_by: { timestamp: desc }, limit: $limit) {
    id writtenOff collateralSeized timestamp txHash
  }
  Attestation(where: { account: { _eq: $wallet } }, order_by: { timestamp: desc }, limit: $limit) {
    id kind amount timestamp txHash
  }
}
`;

/**
 * A withdrawal in flight, and why it needs three timestamps rather than a deposit's two.
 *
 * It is three transactions on two chains: Creditcoin agrees and the credit is gone, the guardians
 * sign and the relay lets the vault release it, and then the borrower signs for it. The gap between
 * the last two is not the protocol waiting on anything — the money is in the vault and the borrower
 * has not claimed it — so a screen that collapses them tells someone they are done before they are.
 *
 * Reading it rather than keeping the state in the component is what makes a request survive a
 * reload. Without this, leaving the screen between asking and claiming loses every trace of the
 * request except a limit that dropped for no visible reason.
 */
export const REMOTE_WITHDRAWALS = `
query RemoteWithdrawals($wallet: String!, $limit: Int = 25) {
  RemoteWithdrawal(
    where: { account: { _eq: $wallet }, withdrawnAt: { _is_null: true } }
    order_by: { requestedAt: desc }
    limit: $limit
  ) {
    id
    amount
    sequence
    requestedAt
    requestTxHash
    approvedAt
    approveTxHash
    withdrawnAt
    asset { id wormholeChainId decimals }
  }
}
`;
