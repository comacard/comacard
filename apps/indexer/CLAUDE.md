# @comacard/indexer

Envio HyperIndex over seven chains. Owned by Fajar (`FjrREPO`). It is history and proofs — never the
authority on anything a user is about to act on.

```bash
bun run codegen      # after any schema.graphql change, before anything else
bun run dev
bun run test         # the parity tests below are the ones that matter
```

Current endpoint lives in `README.md`. It changes often; see below for why.

## The endpoint moves, and nothing tells you

Three facts that cost most of a day between them:

1. **The deployment id is not the commit hash.** Commit `2621060` built endpoint `24e4861`. They are
   the same shape and completely unrelated. Guessing cannot work — `envio-cloud indexer get` is the
   only authority, and `README.md` is a cache of it.
2. **The dev tier caps an indexer at three deployments.** Every new build needs a free slot, so an
   older URL gets deleted and starts returning 404 — including one posted as "final" an hour earlier.
3. **A push with no free slot does not build and does not complain.** The dashboard shows three
   healthy deployments and `auto-deploy: true`. `envio-cloud indexer commits` listing everything as
   `inactive` is the only place it surfaces. Twenty pushes went nowhere before anyone noticed.

There is a fourth: **a deploy issued straight after deleting a slot reports `started` and does
nothing.** Every time. Check `indexer commits` for `active` rather than trusting the message, then
issue the same command again.

**If the indexer looks stale, check `envio-cloud indexer commits` before touching the schema.**

## The chains do not sync in step

Creditcoin is read over plain RPC while the rest are on HyperSync, so a far chain routinely runs
ahead. A relay's `Released` is processed **before** the hub's `ReleaseRequested` that created the row
it belongs to.

The handler that looked for its request, failed to find it, and gave up left every withdrawal reading
"in flight" forever — including completed ones. **Whichever side arrives second does the matching
now**, and the first parks its fact until then. Any new cross-chain join needs the same shape.

Events carry the token and amount but not the sequence, so stages are matched to the oldest open row
for that account and asset. `account` is `@index` because Envio's `getWhere` only reads `id` and
indexed fields.

## Every chain with a vault needs an entry, and every generation of it

Two failures of the same kind, a day apart:

- The EVM→Wormhole chain map held Base and Arbitrum when there were five chains. Optimism, BSC and
  Fuji each hit `if (chainId === undefined) return`, and Envio reported **all seven chains 100%
  synced with their events processed** while producing zero rows for three of them. An unknown chain
  now throws: a chain in `config.yaml` with no entry here is a configuration bug, and a dead indexer
  is cheaper to notice than a half-empty one.
- Redeploying the relays **replaced** their addresses in `config.yaml` rather than adding to them,
  which would have sent completed withdrawals back to "in flight" — their `Released` events came from
  relays no longer listed. **A replaced contract's events still happened.** Every generation is
  listed, and a test asserts each chain has more than one.

`test/chain-map.test.ts` reads both files and asserts they agree in both directions. Removing one
entry makes it fail — that was checked by removing one, not assumed.

## Entity notes

**`RemoteWithdrawal` has three timestamps** because a withdrawal is three transactions on two chains,
and the gaps between them are different kinds of waiting:

```
requestedAt   Creditcoin agreed; the credit is already gone and the limit has dropped
approvedAt    the guardians signed and the relay let the vault release it
withdrawnAt   the borrower signed for it — only here is it in their wallet
```

Between the last two **nothing is waiting on the protocol**: the money is in the vault and the
borrower has not claimed it. A UI that says "withdrawn" at `approvedAt` is telling someone something
untrue about their own money. `withdrawnAt: null` is the query for "this person has money waiting".

**`RemoteDeposit.creditedAt == null` is the pending state**, nothing else needs computing.

## What consumers should and should not read from here

Use the indexer for history. Use the chain for anything the user is about to act on.

That is not a preference — this indexer has held a plausible wrong answer twice in one day, once from
the sync-order bug and once from the dropped relay generation, and neither surfaced as an error.
`apps/app` reads `nativeReleasable` off the vault rather than `RemoteWithdrawal.approvedAt` for
exactly this reason, and a test pins the precedence.
