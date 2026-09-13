# @comacard/core

Domain types and pure functions shared across the workspace. No I/O, no framework, no chain access.

```bash
bun run test
bun run typecheck
```

## `credit.ts` — why the score is behavioural

```ts
export type AttestedEventKind =
  | "collateral_locked" | "collateral_unlocked" | "repaid" | "borrowed" | ...
```

Every one of those is an **event**, and that is forced rather than chosen: Attestcoin proves
transactions and their logs, never balances (see `packages/attestcoin/CLAUDE.md`). A credit model
that wanted net worth could not be proved on Creditcoin at all, so the one that fits is a record of
what someone did.

## `money.ts` — amounts are never numbers

Wire amounts are decimal strings of wei. `Number()` loses precision above ~9e15, which is 0.009 ETH —
well inside the range this product handles. Decode with `BigInt`.

Anything here that formats for display takes the token's own `decimals` rather than assuming 18.
A 6-decimal stablecoin read as 18 is off by a factor of a trillion, and it looks plausible enough to
ship: `apps/app` has a comment about this on every function that touches a price.

## Keep it pure

If something here needs a clock, a fetch or a provider, it belongs in the app or the worker instead.
The value of this package is that it can be tested without any of those, and that both the frontend
and the backend can hold the same definition without one importing the other.
