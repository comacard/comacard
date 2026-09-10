import { indexer } from "envio";
import { emptyProtocol, getOrCreateAccount, logId, minus, PROTOCOL_ID } from "../shared";

/**
 * Creditcoin side.
 *
 * ScoreChanged carries the contract's own view of a borrower — score, limit and
 * available credit — so nothing here recomputes it. CreditScoring.sol is the
 * only place that maths exists, and an indexer that reimplements it is an
 * indexer that will eventually disagree with the chain.
 */
indexer.onEvent(
  { contract: "ASCCreditLine", event: "ScoreChanged" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);

    const account = await getOrCreateAccount(context, id, timestamp);

    context.Account.set({
      ...account,
      score: event.params.score,
      creditLimit: event.params.limit,
      available: event.params.available,
      lastActiveAt: timestamp,
    });
  },
);

indexer.onEvent(
  { contract: "ASCCreditLine", event: "CollateralCredited" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);
    const account = await getOrCreateAccount(context, id, timestamp);

    context.Account.set({
      ...account,
      collateral: account.collateral + event.params.amount,
      lastActiveAt: timestamp,
    });

    const protocol = (await context.Protocol.get(PROTOCOL_ID)) ?? emptyProtocol();
    context.Protocol.set({
      ...protocol,
      totalCollateral: protocol.totalCollateral + event.params.amount,
    });

    context.Attestation.set({
      id: event.params.queryId,
      account: id,
      kind: "collateral_credited",
      amount: event.params.amount,
      provenNonce: 0n,
      blockNumber: BigInt(event.block.number),
      timestamp,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "ASCCreditLine", event: "CollateralReleased" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);
    const account = await getOrCreateAccount(context, id, timestamp);

    // A release may have been held here first, in which case the hold already
    // debited the collateral and this event only clears the marker.
    const fromHold =
      event.params.amount > account.pendingRelease ? account.pendingRelease : event.params.amount;
    const fromCollateral = event.params.amount - fromHold;

    context.Account.set({
      ...account,
      pendingRelease: account.pendingRelease - fromHold,
      collateral: minus(account.collateral, fromCollateral),
      lastActiveAt: timestamp,
    });

    context.Attestation.set({
      id: event.params.queryId,
      account: id,
      kind: "collateral_released",
      amount: event.params.amount,
      provenNonce: 0n,
      blockNumber: BigInt(event.block.number),
      timestamp,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "ASCCreditLine", event: "HistoryImported" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);
    const account = await getOrCreateAccount(context, id, timestamp);

    context.Account.set({
      ...account,
      provenNonce: BigInt(event.params.provenNonce),
      lastActiveAt: timestamp,
    });

    context.Attestation.set({
      id: event.params.queryId,
      account: id,
      kind: "history_imported",
      amount: 0n,
      provenNonce: BigInt(event.params.provenNonce),
      blockNumber: BigInt(event.block.number),
      timestamp,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent({ contract: "ASCCreditLine", event: "Drawn" }, async ({ event, context }) => {
  const id = event.params.account.toLowerCase();
  const timestamp = BigInt(event.block.timestamp);
  const account = await getOrCreateAccount(context, id, timestamp);

  context.Account.set({
    ...account,
    drawn: event.params.outstanding,
    dueAt: BigInt(event.params.dueAt),
    totalDrawn: account.totalDrawn + event.params.amount,
    lastActiveAt: timestamp,
  });

  const protocol = (await context.Protocol.get(PROTOCOL_ID)) ?? emptyProtocol();
  context.Protocol.set({
    ...protocol,
    outstanding: protocol.outstanding + event.params.amount,
    lifetimeDrawn: protocol.lifetimeDrawn + event.params.amount,
  });

  context.Draw.set({
    id: logId(event.chainId, event.transaction.hash, event.logIndex),
    account_id: id,
    amount: event.params.amount,
    outstandingAfter: event.params.outstanding,
    dueAt: BigInt(event.params.dueAt),
    blockNumber: BigInt(event.block.number),
    timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "ASCCreditLine", event: "Repaid" }, async ({ event, context }) => {
  const id = event.params.account.toLowerCase();
  const timestamp = BigInt(event.block.timestamp);
  const account = await getOrCreateAccount(context, id, timestamp);

  // Only a repayment that clears the balance closes a cycle. Partial ones
  // reduce the debt and earn nothing, exactly as the contract scores them.
  const settled = event.params.outstanding === 0n;

  context.Account.set({
    ...account,
    drawn: event.params.outstanding,
    dueAt: settled ? 0n : account.dueAt,
    totalRepaid: account.totalRepaid + event.params.amount,
    cycleCount: settled ? account.cycleCount + 1 : account.cycleCount,
    repayCount: settled ? account.repayCount + 1 : account.repayCount,
    lastActiveAt: timestamp,
  });

  const protocol = (await context.Protocol.get(PROTOCOL_ID)) ?? emptyProtocol();
  context.Protocol.set({
    ...protocol,
    outstanding: minus(protocol.outstanding, event.params.amount),
    lifetimeRepaid: protocol.lifetimeRepaid + event.params.amount,
  });

  context.Repayment.set({
    id: logId(event.chainId, event.transaction.hash, event.logIndex),
    account_id: id,
    amount: event.params.amount,
    outstandingAfter: event.params.outstanding,
    settled,
    blockNumber: BigInt(event.block.number),
    timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "ASCCreditLine", event: "Defaulted" }, async ({ event, context }) => {
  const id = event.params.account.toLowerCase();
  const timestamp = BigInt(event.block.timestamp);
  const account = await getOrCreateAccount(context, id, timestamp);

  context.Account.set({
    ...account,
    drawn: 0n,
    dueAt: 0n,
    collateral: minus(account.collateral, event.params.collateralSeized),
    totalWrittenOff: account.totalWrittenOff + event.params.writtenOff,
    cycleCount: account.cycleCount + 1,
    defaultCount: account.defaultCount + 1,
    lastActiveAt: timestamp,
  });

  const protocol = (await context.Protocol.get(PROTOCOL_ID)) ?? emptyProtocol();
  context.Protocol.set({
    ...protocol,
    outstanding: minus(protocol.outstanding, event.params.writtenOff),
    lifetimeDefaulted: protocol.lifetimeDefaulted + event.params.writtenOff,
    defaultCount: protocol.defaultCount + 1,
    totalCollateral: minus(protocol.totalCollateral, event.params.collateralSeized),
  });

  context.Default.set({
    id: logId(event.chainId, event.transaction.hash, event.logIndex),
    account_id: id,
    writtenOff: event.params.writtenOff,
    collateralSeized: event.params.collateralSeized,
    blockNumber: BigInt(event.block.number),
    timestamp,
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "ASCCreditLine", event: "ReleaseHeld" }, async ({ event, context }) => {
  const id = event.params.account.toLowerCase();
  const timestamp = BigInt(event.block.timestamp);
  const account = await getOrCreateAccount(context, id, timestamp);

  context.Account.set({
    ...account,
    collateral: minus(account.collateral, event.params.amount),
    pendingRelease: event.params.pending,
    lastActiveAt: timestamp,
  });
});
