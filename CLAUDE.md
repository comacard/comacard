# Comacard

A debit card whose limit is earned rather than deposited. Collateral is locked on Ethereum and
never leaves it; Attestcoin proves that lock on Creditcoin, which extends credit against it. Repay
cleanly and the same collateral buys a bigger limit.

Turborepo + Bun workspaces. **Biome** is the linter at the root (`bun run lint`), not ESLint. The
husky pre-commit hook runs `biome check --staged --write`: it only touches staged files and writes
fixes back, so an unrelated mess elsewhere never blocks a commit. Stage a few hundred files at once,
though, and it checks all of them.

## Who owns what

Three people, and the split matters because it decides who fixes what.

| | Owner | Notes |
| --- | --- | --- |
| `contracts/`, `apps/worker`, `apps/indexer` | teammate | Foundry, Solidity 0.8.28, `via_ir`, **London EVM target** |
| `apps/api`, `apps/kyc` | Kiel (`yeheskieltame`) | Bun servers on Railway |
| `apps/app`, `apps/landing` | Axel (`Lexirieru`) | Next 16 |

`apps/web` is an empty scaffold. Nothing runs there.

## The shape of the system

```
Sepolia                    Creditcoin CC3                 off-chain
────────                   ──────────────                 ─────────
SourceVault      ──proof──▶ ASCCreditLine                 apps/kyc  → Didit
 lock()                      draw() repay()                apps/api  → composes all three
 lockToken()                 limitOf() availableOf()       apps/indexer (Envio)
```

Live addresses are in `.env.example` and the indexer config. They are the same on both, and both are
proxies: reading bytecode at the proxy address tells you nothing, the selectors live in the
implementation behind the ERC1967 slot.

## Things that will cost you an afternoon

**Attestation runs 7–9 minutes behind Sepolia.** A lock is not provable until Creditcoin has attested
its block. Nothing in any app can shorten this. `apps/worker/src/status.ts` reports the current lag;
`bun run prove <txHash> collateral_locked` blocks until the block is attested, so it is the command
to use rather than polling by hand.

**`minCycleDuration` is 60 seconds on the deployed contract**, not the 1-day default. A draw repaid
faster than that settles the debt and scores **nothing**: no error, no explanation, the score simply
does not move. Leave more than a minute between draw and repay or the cycle proves nothing.

**Only a repayment that clears the balance to zero closes a cycle.** Partial repayments reduce debt
and earn no mark.

**`.env.example` ships placeholder RPC URLs.** `SEPOLIA_RPC_URL` and `MAINNET_RPC_URL` are literally
`https://sepolia.infura.io/v3/<key>`. Copy the file as-is and the worker dies with
`401 Unauthorized: invalid project id` before doing anything. Use the `publicnode.com` endpoints.

**`apps/app/.env.local` is a symlink to the root `.env`**, and it is tracked in git on purpose (see
the negation in `.gitignore`). Replacing it with a real file means committing environment contents.

**Every amount on the wire is a decimal string, not a number.** They are wei; `Number()` loses
precision above ~9e15. Decode with `BigInt`, never `Number`.

## Reading state: three sources, and they disagree on purpose

- **The chain** is the truth. `limitOf` / `availableOf` are read live because repricing collateral
  moves every limit at once without an event per account.
- **The indexer** (Envio) is history and proofs. Its `Account` row is as of that account's last
  transaction, so it is right for history and stale for limits. It is also the only place with
  `Attestation` rows, which is how a screen learns a lock has finished crossing.
- **`apps/api`** composes the two plus KYC into one answer per wallet. The app talks only to this.

A wallet's collateral is `locked` on Sepolia and `proved` on Creditcoin, and between a lock and its
proof those two numbers genuinely differ. Only `proved` raises a limit. Never show one as the other.

## The card

Derived, not stored: `HMAC(CARD_SECRET, wallet)` gives a Luhn-valid PAN on the private BIN `9924`,
plus an account number and CVV. Rotating `CARD_SECRET` reissues everyone's card.

It exists the moment KYC clears; there is no activation step. The full PAN and CVV are returned
**only** by `GET /account/:wallet/card`. `GET /account/:wallet` carries the masked number and no CVV
at all, so a list screen never holds a PAN. Respect that split.

The cardholder name is OCR'd by Didit off the identity document and reaches the app as
`card.holder`. Nobody types it: a typed name is not the name that was verified.

## Verified end to end

`docs/e2e-testnet-run.md` records a full cycle against the deployed contracts with every transaction
hash: lock 0.0006 ETH, prove, draw, repay, score 0 → 42, limit 0.4 → 0.4975 tCTC. The maths is worked
through there, so a limit that looks wrong can be checked by hand.

## Demo

`DEMO.md` is the runbook. The one line worth internalising: **lock the collateral before you start
recording**, because otherwise you spend nine minutes on camera watching a spinner.
