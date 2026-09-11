import { type EvmOnEventContext, indexer } from "envio";

/**
 * Multi-asset collateral. Two chains again, and the same discipline: Sepolia
 * records what was locked, Creditcoin records what was credited, and the two
 * are separate columns because they are separate facts. A lock can exist here
 * minutes before its proof arrives, and a cardholder looking at the gap is
 * looking at attestation lag, not a bug.
 */
const positionId = (account: string, token: string) => `${account}-${token}`;

async function position(
  context: EvmOnEventContext,
  account: string,
  token: string,
  timestamp: bigint,
) {
  const id = positionId(account, token);
  return (
    (await context.TokenPosition.get(id)) ?? {
      id,
      account,
      token_id: token,
      locked: 0n,
      credited: 0n,
      pendingRelease: 0n,
      lastActiveAt: timestamp,
    }
  );
}

const minus = (a: bigint, b: bigint) => (a > b ? a - b : 0n);

// ---------------- Creditcoin: what the line accepts ----------------

indexer.onEvent({ contract: "ASCCreditLine", event: "TokenListed" }, async ({ event, context }) => {
  const at = BigInt(event.block.timestamp);
  context.Token.set({
    id: event.params.token.toLowerCase(),
    decimals: Number(event.params.decimals),
    price: event.params.price,
    listedAt: at,
    pricedAt: at,
  });
});

indexer.onEvent(
  { contract: "ASCCreditLine", event: "TokenPriceChanged" },
  async ({ event, context }) => {
    const id = event.params.token.toLowerCase();
    const token = await context.Token.get(id);
    if (!token) return;
    context.Token.set({
      ...token,
      price: event.params.to,
      pricedAt: BigInt(event.block.timestamp),
    });
  },
);

// ---------------- Creditcoin: what was credited ----------------

indexer.onEvent(
  { contract: "ASCCreditLine", event: "TokenCollateralCredited" },
  async ({ event, context }) => {
    const account = event.params.account.toLowerCase();
    const token = event.params.token.toLowerCase();
    const at = BigInt(event.block.timestamp);
    const p = await position(context, account, token, at);
    context.TokenPosition.set({
      ...p,
      credited: p.credited + event.params.amount,
      lastActiveAt: at,
    });
  },
);

indexer.onEvent(
  { contract: "ASCCreditLine", event: "TokenCollateralReleased" },
  async ({ event, context }) => {
    const account = event.params.account.toLowerCase();
    const token = event.params.token.toLowerCase();
    const at = BigInt(event.block.timestamp);
    const p = await position(context, account, token, at);
    // A hold may already have debited this; the hold is consumed first, exactly
    // as the contract does it, so the two can never disagree.
    const fromHold =
      event.params.amount > p.pendingRelease ? p.pendingRelease : event.params.amount;
    context.TokenPosition.set({
      ...p,
      pendingRelease: p.pendingRelease - fromHold,
      credited: minus(p.credited, event.params.amount - fromHold),
      lastActiveAt: at,
    });
  },
);

indexer.onEvent(
  { contract: "ASCCreditLine", event: "TokenReleaseHeld" },
  async ({ event, context }) => {
    const account = event.params.account.toLowerCase();
    const token = event.params.token.toLowerCase();
    const at = BigInt(event.block.timestamp);
    const p = await position(context, account, token, at);
    context.TokenPosition.set({
      ...p,
      credited: minus(p.credited, event.params.amount),
      pendingRelease: event.params.pending,
      lastActiveAt: at,
    });
  },
);

// ---------------- Sepolia: what was locked ----------------

indexer.onEvent({ contract: "SourceVault", event: "TokenLocked" }, async ({ event, context }) => {
  const account = event.params.account.toLowerCase();
  const token = event.params.token.toLowerCase();
  const at = BigInt(event.block.timestamp);
  const p = await position(context, account, token, at);
  context.TokenPosition.set({ ...p, locked: p.locked + event.params.amount, lastActiveAt: at });
});

indexer.onEvent({ contract: "SourceVault", event: "TokenUnlocked" }, async ({ event, context }) => {
  const account = event.params.account.toLowerCase();
  const token = event.params.token.toLowerCase();
  const at = BigInt(event.block.timestamp);
  const p = await position(context, account, token, at);
  context.TokenPosition.set({
    ...p,
    locked: minus(p.locked, event.params.amount),
    lastActiveAt: at,
  });
});
