# @comacard/api

Bun server on Railway. Owned by Kiel (`yeheskieltame`). It is the only backend `apps/app` talks to.

```bash
bun run dev       # :3003 by default
bun run test
```

Live: `https://api-production-1141.up.railway.app` · `/docs` renders the OpenAPI.

## What it is for

One answer per wallet, composed from three places that each know a different part:

```
GET /account/:wallet
  ├─ apps/kyc          is this person verified, and what is their name
  ├─ Creditcoin RPC    limitOf, availableOf, scoreOf, accountOf   ← one batched eth_call
  └─ Envio indexer     history, attestations, cross-chain deposits
```

The app never reaches those three directly for this — that is the point of the service.

## Routes, and which ones need the indexer

| Route | indexer | kyc | chain |
| --- | --- | --- | --- |
| `GET /health` | | | |
| `GET /openapi.json`, `/docs` | | | |
| `POST /account/:wallet/kyc` | | ✓ | |
| `GET /account/:wallet` | ✓ | ✓ | ✓ |
| `GET /account/:wallet/card` | ✓ | ✓ | ✓ |
| `GET /account/:wallet/activity` | ✓ | | |
| `GET /protocol` | ✓ | | ✓ |

That table is the fastest way to diagnose a 502: **if every indexer-backed route fails and the rest
work, it is `INDEXER_URL`, not the service.** It has happened, and the endpoint moves often — Envio's
dev tier caps at three deployments so old URLs start 404ing without warning. Check
`apps/indexer/README.md` for the current one.

## The 502 that takes everything with it

`/account/:wallet` runs five upstreams through one `Promise.all`, and two of them are indexer calls.
One rejection therefore takes down the card, the KYC status and the on-chain credit as well as the
history — four healthy answers lost to one sick one.

`card.spendableCtc` is the headline figure on Home, and it reads `availableOf` off the chain. It was
never affected by the indexer and went dark anyway.

**Settling the two indexer calls independently** (`Promise.allSettled`, defaulting their results to
empty) would make an indexer outage cost history and nothing else. Worth doing for a dependency that
moved five times in one day.

## Read the chain for anything a user acts on

`drawn` used to come from the indexer, which holds it **as of the account's last transaction**. That
composes badly with `repay()` refusing an overpayment: a stale figure reverts precisely when someone
has just drawn, which is when they are most likely to be looking at the screen.

The whole credit block is now one batched `eth_call` over `limitOf`, `availableOf`, `scoreOf` and
`accountOf`, so score, debt, collateral, cycles and the due date are all as the contract has them.

Two consequences worth knowing:

- **`credit` is never null.** It used to be, for any wallet whose only collateral arrived through the
  Wormhole hub — no `ScoreChanged` means no indexer row, while `limitOf` reads non-zero. A
  cross-chain-only depositor had a limit and an empty credit block.
- **`accountOf` is decoded positionally** as nine static words, and the word count is asserted first,
  so a changed struct fails loudly rather than quietly reporting one field as another.

## The card split is a security boundary, not a convenience

`GET /account/:wallet` carries the **masked** number and no CVV. The full PAN and CVV come back only
from `GET /account/:wallet/card`. A list screen therefore never holds a PAN.

Neither route authenticates beyond CORS today. That is a known gap and the split is what limits it:
respect it rather than adding the full number to the composed response because it is convenient.

The card itself is derived, not stored — `HMAC(CARD_SECRET, wallet)` gives a Luhn-valid PAN on BIN
`9924`. Rotating `CARD_SECRET` reissues everyone's card.

## `REMOTE_CHAINS` must name every chain with a vault

It had two when there were five, so BSC, Fuji and Optimism rendered as "Wormhole chain 6" with no
explorer link. A test mirrors `vaults` in `apps/worker/src/config.ts`, so adding a sixth chain fails
here until it is named. Keep it — this is the fourth place in the repo where two lists must agree.
