# Worker

The oracle query worker from the Attestcoin architecture. It watches the source
chain, asks the proof builder for an inclusion proof, and submits it to
`ASCCreditLine.execute` on Creditcoin — the step that turns a lock on Sepolia
into credit on Creditcoin.

It does the same errand for the chains Attestcoin cannot reach. Creditcoin has
the Wormhole Core Contract and nothing else — no token bridge, no automatic
relayer — so the guardians sign a deposit and then somebody has to hand the
message over. `bun run relay` is that somebody.

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

## Deposits from other chains

```sh
bun run relay 10004 0    # Base Sepolia, message sequence 0
bun run relay 10003 0    # Arbitrum Sepolia
```

It waits for the guardians, then submits. The wait is the slow part and none of
it is this program either: the vaults publish at **finalized** consistency, and
an L2 finalizes against Ethereum, so signatures appear roughly fifteen minutes
after the deposit. That is the price of not crediting collateral a reorg could
take back.

It holds no privilege. `receiveFromWormhole` trusts the signatures rather than
the sender, so a borrower who would rather not wait for us can fetch the same
bytes from Wormholescan and submit them.

## Running

```sh
export WALLET_PK=...            # pays for the Creditcoin submission
bun run start                   # watch and prove continuously
bun run prove <txHash>          # prove one transaction
bun run prove <txHash> history  # import mainnet history instead
bun run relay <chainId> <seq>   # deliver a Wormhole deposit
bun src/status.ts               # what Creditcoin will accept proofs from
```

Retries are safe: `ASCBase` rejects a query it has already processed, so
resubmitting an event is harmless and a crash-and-restart needs no queue.
