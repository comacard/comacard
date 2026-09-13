# Comacard

A debit card whose limit is earned rather than deposited. Collateral is locked on its own chain and
never leaves it; a proof crosses to Creditcoin, which extends credit against it. Repay cleanly and
the same collateral buys a bigger limit.

Turborepo + Bun workspaces. **Biome** is the linter at the root (`bun run lint`), not ESLint. The
husky pre-commit hook runs `biome check --staged --write`: it only touches staged files and writes
fixes back, so an unrelated mess elsewhere never blocks a commit. Stage a few hundred files at once,
though, and it checks all of them.

## Who owns what

Three people, and the split matters because it decides who fixes what.

| | Owner | Notes |
| --- | --- | --- |
| `contracts/`, `apps/worker`, `apps/indexer` | Fajar (`FjrREPO`) | Foundry, Solidity 0.8.28, `via_ir`, **London EVM target** |
| `apps/api`, `apps/kyc` | Kiel (`yeheskieltame`) | Bun servers on Railway |
| `apps/app`, `apps/landing` | Axel (`Lexirieru`) | Next 16 |

`apps/web` is an empty scaffold. Nothing runs there.

## The shape of the system: two carriers, and only one of them is Attestcoin

This is the single most confusing thing about the codebase, and the mistake it causes is thinking
`ASCCreditLine` grew multi-chain support. It did not.

```
Sepolia                       Creditcoin CC3                     off-chain
────────                      ──────────────                     ─────────
SourceVault  ──Attestcoin──▶  ASCCreditLine                      apps/kyc  → Didit
 lock()                        draw() repay()                     apps/api  → composes all three
 lockToken()                   limitOf() availableOf()            apps/indexer (Envio)
                                    │
Base · Arbitrum · Optimism          │ asks for a total
BSC · Fuji                          ▼
WormholeVault ──Wormhole───▶  WormholeCollateralHub   ← a SEPARATE contract
 lockNative()                  receiveFromWormhole()
 lockToken()                   requestRelease()
```

**`ASCCreditLine` is still bound to one source chain, permanently.** `sourceVault` and
`sourceChainKey` are written once in `initialize` and there is no setter — read them on the live
contract and `sourceChainKey` is still `1`, Sepolia. That is issue #4, and it is still open.

Collateral from the other five chains raises a limit anyway, because the credit line does not accept
their proofs — it **asks a neighbour for a total**:

```solidity
address hub = remoteCollateralHub;              // slot 11, two lines
if (hub != address(0)) value += IRemoteCollateral(hub).valueOf(who);
```

So `collateralValueOf` is `accountOf.collateral` (Attestcoin's) **plus** `hub.valueOf` (Wormhole's),
and a limit can move without the credit line learning about a second chain at all.

Why it was built beside rather than inside, since the obvious design is a source-chain registry:

- **Attestcoin can only prove Sepolia and Ethereum mainnet** (`chainKey` 1 and 3 on CC3 testnet). A
  registry would let the line accept proofs from many chains while Attestcoin could still produce
  them for two, both Ethereum. Correct code, and a Base user still stuck. The missing piece was a
  carrier, not a registry.
- **`ASCCreditLine` has ~913 bytes left** of the 24,576 limit. Nothing new fits inside it.
- Changing its storage layout means upgrading a proxy that is holding live collateral.

The registry is still the right change **if Attestcoin ever attests a third chain**, and #4 records
how to do it safely. Until then it is parked, not forgotten.

**The two carriers do not have the same trust properties, and the difference is worth saying out
loud before anyone checks.** Wormhole is trustless in both directions. Attestcoin is trustless
inbound and **operator-approved outbound** — `SourceVault.approveRelease` is gated on us — because
Attestcoin writability is still in third-party audit and Creditcoin cannot write back to Ethereum.
"Non-custodial" is not a claim this product can make about the whole of itself. `contracts/TRUST.md`
has the full version, including the one that surprises people: **Wormhole's testnet guardian set has
a single member**, so every cross-chain message we have demonstrated rests on one key. That is a
property of the testnet, not of the design, but a judge who decodes one of our VAAs will find the
byte in a minute.

Live addresses are in `.env.example` and the indexer config. They are the same on both, and both are
proxies: reading bytecode at the proxy address tells you nothing, the selectors live in the
implementation behind the ERC1967 slot.

## Three numbering systems that do not agree

Every cross-chain bug this repo has had passed through here at least once.

| | Sepolia | Base | Arbitrum | Optimism | BSC | Fuji |
| --- | --- | --- | --- | --- | --- | --- |
| **EVM chain id** | 11155111 | 84532 | 421614 | 11155420 | 97 | 43113 |
| **Wormhole chain id** | 10002 | 10004 | 10003 | 10005 | **4** | **6** |
| **Attestcoin chainKey** | 1 | — | — | — | — | — |

BSC and Fuji predate Wormhole's 10000-block testnet scheme and keep their mainnet ids. Extrapolating
the sequence puts Fuji at `10006`, which is **Holesky** — a different chain, and the app shipped that
bug until it was caught. `apps/app/lib/comacard/__tests__/chains.test.ts` and
`apps/indexer/test/chain-map.test.ts` both pin these now.

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

**A receipt is not a success, and a success is not always proof.** A reverted transaction produces a
receipt like any other, and wagmi's `receipt.isSuccess` means the *query* resolved, not that the
transaction did — four screens reported reverts as green checks before this was caught. Worse, the
Fuji and Arbitrum public RPCs both return status-1 receipts for transactions `eth_getTransactionReceipt`
afterwards reports as unknown, and `tx.wait()` in ethers resolves to `null` without throwing. On
those chains the only honest test is reading back the state the transaction was meant to change.
`apps/app/lib/comacard/tx.ts` is that rule written once.

**The Envio deployment id is not the commit hash.** `2621060` built `24e4861`. They are the same
shape and unrelated, and guessing wasted an hour. The dev tier caps an indexer at three deployments,
so every redeploy deletes an older one and its URL starts returning 404 — including URLs posted as
"final" an hour earlier. `apps/indexer/README.md` is the record; `envio-cloud indexer get` is the
only authority. Check it before assuming the schema broke.

## Reading state: three sources, and they disagree on purpose

- **The chain** is the truth. `limitOf` / `availableOf` are read live because repricing collateral
  moves every limit at once without an event per account.
- **The indexer** (Envio) is history and proofs. Its `Account` row is as of that account's last
  transaction, so it is right for history and stale for limits. It is also the only place with
  `Attestation` rows, which is how a screen learns a lock has finished crossing.
- **`apps/api`** composes the two plus KYC into one answer per wallet. The app talks only to this.

A wallet's collateral is `locked` on Sepolia and `proved` on Creditcoin, and between a lock and its
proof those two numbers genuinely differ. Only `proved` raises a limit. Never show one as the other.

## The one bug shape this project keeps producing

Five separate bugs in a single day, in five different files by three different people, and every one
was **a plural treated as a singular**:

1. `ReleaseRelay` did not check *which* chain a release was for — one signed release was valid on all five.
2. `approveRelease` set rather than added — two withdrawals in flight, the second ate the first.
3. The indexer's EVM→Wormhole chain map held two of five chains — three chains indexed as if they did not exist.
4. `RemoteWithdrawal`'s stages assumed two chains sync in step; they do not, and a `Released` routinely arrives before the request that created its row.
5. The app's `REMOTE_CHAINS` named two of five, and had Fuji's id wrong on top of that.

None of them threw. Every one produced a plausible wrong answer: a missing row, a stale figure, a
chain rendered as "Wormhole chain 6". **If a check involves "which one of several", a test suite with
one of them cannot catch it** — which is why four of the five needed a live run or a second fixture
to surface.

The countermeasure that works is a test that reads *both* lists and asserts they agree in both
directions. There are four of those now: `apps/app/lib/comacard/__tests__/chains.test.ts`,
`apps/indexer/test/chain-map.test.ts`, `packages/attestcoin/test/action-parity.test.ts`, and
`contracts/test/unit/ActionDispatch.t.sol`.

A related habit: **an edit that reports success can change nothing.** Three times in one day a patch
matched text a formatter had already reflowed, applied to nothing, and said it worked. Re-read the
file, or assert on the shape rather than on the edit.

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

`DEMO.md` is the runbook. The lines worth internalising:

- **Lock the collateral before you start recording.** Otherwise you spend nine minutes on camera
  watching a spinner.
- **Use BSC or Fuji for anything cross-chain that has to land live.** They are L1s and the guardians
  sign in well under a minute. Base, Arbitrum and Optimism publish at finalized consistency and
  finalize against Ethereum, so they take fifteen to twenty — same script, twenty minutes of silence
  in the middle.
- **`cd apps/worker && bun run roundtrip 4`** runs the whole cross-chain story as one command: lock,
  guardians, credit, request, relay, claim, every figure read off a contract. It exists because the
  hand-typed `cast` version had two commands wrong in ways that failed silently.

## Per-directory notes

Each workspace has its own `CLAUDE.md` with what will actually cost you time there. The ones worth
reading before touching anything:

| | |
| --- | --- |
| `contracts/CLAUDE.md` | the 913-byte ceiling, `via_ir`, and why the hub lives beside the line |
| `apps/app/CLAUDE.md` | a Next 16 app ported from a Stellar product, and what that still implies |
| `apps/worker/CLAUDE.md` | the two loops, and why a receipt does not mean delivery |
| `apps/indexer/CLAUDE.md` | Envio's three-deployment cap and the silent failures around it |
| `apps/api/CLAUDE.md` | one `Promise.all` that used to take the whole response down |
| `apps/kyc/CLAUDE.md` | why a newer session must not outrank an approval |
