# Indexer

Reads both halves of Comacard into one GraphQL API: the collateral locks on
Ethereum Sepolia and the credit line itself on Creditcoin.

The two chains sync very differently. Sepolia is on Envio's HyperSync and comes
down in seconds. Creditcoin CC3 is not, so it reads over plain RPC — which is
fine here, because the chain produces a block every 15 seconds and these
contracts are days old.

## Live

    https://indexer.dev.hyperindex.xyz/8373da2/v1/graphql

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
