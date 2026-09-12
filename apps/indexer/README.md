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

## Live

    https://indexer.dev.hyperindex.xyz/5d01570/v1/graphql

Each deployment gets its own URL on the Development plan, and old ones keep
serving, so this changes whenever `main` moves. Consumers read `INDEXER_URL`.

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
