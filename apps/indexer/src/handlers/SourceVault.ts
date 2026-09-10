import { indexer } from "envio";
import { emptyAccount, logId } from "../shared";

/**
 * Sepolia side. These events are the facts Attestcoin later proves across to
 * Creditcoin, so seeing them here first is expected — the lock is real long
 * before the credit line hears about it.
 */
indexer.onEvent(
  { contract: "SourceVault", event: "CollateralLocked" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);

    // Protocol is a Creditcoin-side aggregate and is never written from here.
    // Both chains sharing one mutable singleton is what silently reset the
    // account count: this handler incremented it, then a Creditcoin handler
    // wrote the row back from a read that predated the increment. A lock that
    // has not been proved across yet is not a borrower anyway.
    const account = (await context.Account.get(id)) ?? emptyAccount(id, timestamp);
    context.Account.set({ ...account, lastActiveAt: timestamp });

    context.CollateralLock.set({
      id: logId(event.chainId, event.transaction.hash, event.logIndex),
      account_id: id,
      amount: event.params.amount,
      nonce: event.params.nonce,
      released: false,
      blockNumber: BigInt(event.block.number),
      timestamp,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "SourceVault", event: "CollateralUnlocked" },
  // Nothing to read first: an unlock is recorded on its own, and the account
  // row is reconciled from the Creditcoin side when the proof lands there.
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const timestamp = BigInt(event.block.timestamp);

    context.CollateralLock.set({
      id: logId(event.chainId, event.transaction.hash, event.logIndex),
      account_id: id,
      amount: event.params.amount,
      nonce: event.params.nonce,
      released: true,
      blockNumber: BigInt(event.block.number),
      timestamp,
      txHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "SourceVault", event: "ReleaseApproved" },
  async ({ event, context }) => {
    const id = event.params.account.toLowerCase();
    const account = await context.Account.get(id);
    if (account) {
      context.Account.set({ ...account, lastActiveAt: BigInt(event.block.timestamp) });
    }
  },
);
