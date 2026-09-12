# Indexer

Reads every half of Comacard into one GraphQL API: the collateral locks on
Ethereum Sepolia, the deposits on Base and Arbitrum Sepolia, and the credit line
itself on Creditcoin.

The chains sync very differently. Sepolia, Base and Arbitrum are on Envio's
HyperSync and come down in seconds. Creditcoin CC3 is not, so it reads over
plain RPC — which is fine here, because the chain produces a block every 15
seconds and these contracts are days old.

## Deposits in flight

`RemoteDeposit` is the row an app needs while a cross-chain deposit is on its
way. It is written when the vault locks the funds and completed when Creditcoin
credits them, and `creditedAt` is null in between:

```graphql
{
  RemoteDeposit(where: { account: { _eq: "0x…" } }) {
    amount sequence lockedAt creditedAt
    asset { wormholeChainId token decimals price }
  }
}
```

That gap is normally about fifteen minutes. The vaults publish at finalized
consistency and an L2 finalizes against Ethereum, so the guardians take that
long to sign. Show it as pending rather than as a missing balance.

`RemotePosition` carries the same distinction as a running total: `locked` is
what the remote vault holds, `credited` is what Creditcoin counts toward a
limit.

## Withdrawals in flight

`RemoteWithdrawal` is the mirror, and it has three stages rather than two,
because a withdrawal is three transactions on two chains:

```graphql
{
  RemoteWithdrawal(where: { account: { _eq: "0x…" } }) {
    amount requestedAt approvedAt withdrawnAt
    asset { wormholeChainId decimals }
  }
}
```

A relay that gets replaced stays in `config.yaml` alongside the new one. Its
events still happened, and dropping it sends every withdrawal it completed back
to reading "in flight" — a wrong answer about money rather than a missing one.
Three generations have shipped; append rather than replace.

`requestedAt` — Creditcoin agreed and the credit is already gone.
`approvedAt` — the guardians signed and the relay let the vault release it.
`withdrawnAt` — the borrower signed for it. Only here is it in their wallet.

The gap between the last two is not the protocol waiting on anything: the money
is sitting in the vault and the borrower has not claimed it. A UI that says
"withdrawn" at `approvedAt` is telling them something untrue.

## Live

    https://indexer.dev.hyperindex.xyz/5a5df01/v1/graphql

Each deployment gets its own URL on the Development plan, and old ones keep
serving, so this changes whenever `main` moves. Consumers read `INDEXER_URL`.

The Development plan also caps an indexer at **three deployments**, and a push
with no free slot does not build and does not complain — the dashboard shows
three healthy deployments and settings still say `auto-deploy: true`. If the
data looks stale, check for `inactive` commits before suspecting the schema:

```sh
ENVIO_GITHUB_TOKEN=$(gh auth token) bunx envio-cloud login
bunx envio-cloud indexer commits comacard comacard
bunx envio-cloud deployment delete comacard <old-commit> comacard --yes
bunx envio-cloud deployment deploy comacard <commit> comacard --yes
```

Two things that cost an afternoon between them:

**A deploy issued straight after deleting a slot reports `started` and does
nothing.** Every time. Check `indexer commits` for `active` rather than trusting
the message, and issue the same command again — the second one works.

**The deployment id is not the commit hash.** `2621060` built `24e4861`; they
happen to look alike and are unrelated. It only comes from `indexer get`, so
guessing a URL from a commit will always 404.

```graphql
{ Account { id collateral drawn score creditLimit available } }
```

## What it does not do

It never recomputes a credit score. The contract emits `ScoreChanged` with the
score, limit and available credit already worked out, and the indexer stores
what it is given. `CreditScoring.sol` is the only place that maths exists;
an indexer that reimplements it is one that will eventually disagree with the
chain it indexes.

## Running

```sh
cp .env.example .env      # add an Envio API token for the Sepolia side
bun run codegen
bun run dev               # needs Docker for Postgres
```

GraphQL lands on `http://localhost:8080`.

## Deploying

Envio Cloud builds from this directory on a push to `main`. In the dashboard the
indexer directory must be set to `apps/indexer`, not the repo root.
