# Worker

The oracle query worker from the Attestcoin architecture. It watches the source
chain, asks the proof builder for an inclusion proof, and submits it to
`ASCCreditLine.execute` on Creditcoin — the step that turns a lock on Sepolia
into credit on Creditcoin.

## Timing

Attestation runs roughly 30–40 Sepolia blocks behind the head, so a lock is not
provable for about eight minutes. That is why the worker waits on the proof
builder rather than the precompile: a block being attested on-chain is not the
same as the builder being able to serve a proof over it, and only the second one
matters here.

For a demo, lock the collateral first and prove it a few minutes later.

## Seeing the whole thing work

```sh
bun run demo             # lock, prove, draw, hold, repay
bun run demo --no-lock   # skip to borrowing against collateral already posted
```

It prints what the chain says at each step and ends with the before-and-after:
repaying on time raises the limit. Every figure comes from a live call, so the
arithmetic can be checked rather than believed.

The lock leg takes about nine minutes, and none of that is this program: a fresh
lock is not provable until Attestcoin has attested its block, which runs 30-45
source blocks behind. `--no-lock` is there for when you have already paid that
cost once.

## Running

```sh
export WALLET_PK=...            # pays for the Creditcoin submission
bun run start                   # watch and prove continuously
bun run prove <txHash>          # prove one transaction
bun run prove <txHash> history  # import mainnet history instead
bun src/status.ts               # what Creditcoin will accept proofs from
```

Retries are safe: `ASCBase` rejects a query it has already processed, so
resubmitting an event is harmless and a crash-and-restart needs no queue.
