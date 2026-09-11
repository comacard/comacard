# A full credit cycle, on the deployed testnets

Run on **11 September 2026** against the live contracts. Every hash below opens
in a public explorer. Nothing here is mocked, staged, or replayed from a
fixture: a fresh wallet went from zero collateral and zero history to a credit
score of 42 in about eleven minutes.

This is the evidence that the Attestcoin leg works end to end, which is the one
thing a Comacard demo has to prove.

## The wallet

```
0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0
```

Generated locally for this run. Its key lives in `.env` as `WALLET_PK`, which is
gitignored; the same name is what `apps/worker/src/config.ts` and `contracts/`
read, so one wallet drives the app, the worker and `cast`. Funded with
0.001 Sepolia ETH and 2000 tCTC before the run.

It started with nothing on Creditcoin: no collateral, no proven nonce, score 0,
limit 0. That is the point. Every number below was earned during the run.

## What happened, in order

| # | Step | Result |
| --- | --- | --- |
| 1 | `SourceVault.lock()` with 0.0006 ETH on Sepolia | [`0xa6829215…f9c66`](https://sepolia.etherscan.io/tx/0xa682921575b0d9a948e4cc7019544be3f371817a19ce7ae1a28fff8eca1f9c66), block 11681419 |
| 2 | Indexer sees the lock | within seconds (Sepolia is on HyperSync) |
| 3 | Creditcoin still reads `limitOf` = 0 | correct: the proof has not crossed |
| 4 | Attestcoin proves the lock | [`0x8d9e9eda…ab89d`](https://creditcoin-testnet.blockscout.com/tx/0x8d9e9eda0cb8e6d13bec96487136cb1c1bdbc37707f978d498e0056f585ab89d), ~8 min after the lock |
| 5 | Limit appears from nothing | 0.4 tCTC |
| 6 | `draw(0.24 tCTC)` | [`0x90452a09…13365`](https://creditcoin-testnet.blockscout.com/tx/0x90452a0994d6dfcaf2ef43dcaa8df350123a43932b1becd598b54a3320713365) |
| 7 | Wait past `minCycleDuration` | 75 s against a 60 s minimum |
| 8 | `repay()` the full 0.24 tCTC | [`0x72764124…11cd3`](https://creditcoin-testnet.blockscout.com/tx/0x72764124519c344bb88e6b32e1608e0c7c4878cd9330c2a287255a2308e11cd3), `settled: true` |
| 9 | Score and limit rise | 0 → 42, 0.4 → 0.4975 tCTC |

```
=== BEFORE ===            === AFTER ===
score     0               score     42
limit     0.4 tCTC        limit     0.497512437810945273 tCTC
available 0.4 tCTC        available 0.497512437810945273 tCTC
                          outstanding 0
```

## The numbers are not approximate

Both figures were predicted from the source before the transaction was sent, and
both came back exact. That is worth stating because it means `CreditScoring.sol`
is doing precisely what it is documented to do, and a reader can check the maths
by hand.

**The limit, before any history.** `collateralPrice` is 1000 CTC per ETH, so
0.0006 ETH is worth 0.6 CTC. At score 0 the required collateralisation is
`MAX_RATIO_BPS` = 15000, i.e. 150%:

```
limit = 0.6 × 10000 / 15000 = 0.4 tCTC
```

**The score, after one clean cycle.** Three components, from
`CreditScoring.score`:

| Component | Weight | Earned | Why |
| --- | --- | --- | --- |
| `_historyPoints` | 40 | **0** | `provenNonce` is 0; no Ethereum history was imported |
| `_recordPoints` | 40 | **40** | 1 cycle concluded, 1 repaid, so the full weight |
| `_consistencyPoints` | 20 | **2** | 1 repayment against a target of 10 |

Total 42.

**The limit afterwards.** At score 42 the ratio falls linearly toward
`MIN_RATIO_BPS`:

```
bps   = 15000 − (15000 − 8000) × 42 / 100 = 12060
limit = 0.6 × 10000 / 12060 = 0.497512437810945273 tCTC
```

The same collateral now supports 24% more credit. Nothing was added; the record
did the work. That sentence is the product.

## Live parameters at the time of the run

Read straight off `ASCCreditLine` at
[`0x18052272…E906`](https://creditcoin-testnet.blockscout.com/address/0x18052272cC69113DE2b45d2BDB4E1fB287F4E906):

| Parameter | Value | Note |
| --- | --- | --- |
| `collateralPrice` | 1000 CTC per ETH | operator-fed; see the oracle note below |
| `term` | 30 days | how long a draw may stay outstanding |
| `minCycleDuration` | **60 seconds** | lowered from the 1-day default, which is what makes a cycle demoable in one take |
| collateralisation | 150% at score 0 → 80% at score 100 | linear |
| lendable pool | ~40 tCTC | shared; every demo draw comes out of it |

## What the rest of the stack saw

The chain is the source of truth, but a demo also has to show the indexer and
the API agreeing with it. Both did, without intervention.

**Envio indexer:**

```json
{
  "Account":     [{ "score": "42", "creditLimit": "497512437810945273",
                    "cycleCount": 1, "repayCount": 1, "collateral": "600000000000000" }],
  "Attestation": [{ "kind": "collateral_credited", "amount": "600000000000000" }],
  "Draw":        [{ "amount": "240000000000000000" }],
  "Repayment":   [{ "amount": "240000000000000000", "settled": true }]
}
```

**API** (`GET /account/0xe4db…8fa0`): `score 42`, `limitCtc 0.4975`,
`availableCtc 0.4975`, `drawnCtc 0.0000`, `cycle/repay 1/1`.

This also served as the first real test of the five documents in
`apps/app/lib/comacard/graphql/queries.ts`. They are not merely valid GraphQL:
each returned correct rows for a real account. `LATEST_CREDIT_ATTESTATION` in
particular — the query a waiting screen polls to learn that collateral has
finished crossing — now has a genuine row behind it.

## Timing, which is the hardest part of the UX

Attestation ran about **42 Sepolia blocks behind**, roughly eight minutes, and
the gap stayed constant: between two measurements the attested tip and the chain
head each advanced 20 blocks. So the lag does not grow, but it also cannot be
hurried.

From the `prove` log, the attested height crawled from 11681390 to past our
11681419 over roughly nineteen 15-second retries.

**Nothing in the app can shorten this.** Any screen that locks collateral and
then waits on a spinner will feel broken. Overlap the wait with identity
verification, and treat the arrival as an event rather than a refresh.

## What this run does *not* prove

Being explicit, so nobody reads more into it than it says:

- **KYC and card issuance.** `card.issued` is still `false` with reason
  `kyc_required`, which is correct — the card only exists once Didit approves.
  That leg needs a real identity check and has not been run yet.
- **Getting collateral back.** `SourceVault.unlock` needs an operator to call
  `approveRelease` first, and `placeReleaseHold` on the Creditcoin side. Neither
  is reachable from the app.
- **History import.** `provenNonce` is still 0. Proving Ethereum mainnet
  activity would add up to 40 more points and needs the worker, not the app.
- **Default.** `markDefaulted` was not exercised; it needs a draw left unpaid
  past a 30-day term.

## Two things that will waste your time

**`.env.example` ships placeholder RPC URLs.** `SEPOLIA_RPC_URL` and
`MAINNET_RPC_URL` are literally `https://sepolia.infura.io/v3/<key>`. Copy the
file as-is and the worker dies with `401 Unauthorized: invalid project id`
before doing anything. They are now set to `publicnode.com` endpoints, which
need no key and worked throughout this run.

**Repaying too fast scores nothing.** A repayment settles the debt whenever it
happens, but `cycleCount` and `repayCount` only move if the draw stayed open for
`minCycleDuration`. Repay in under 60 seconds and the score stays at 0 with no
error and no explanation. The 75-second wait in this run exists for exactly that
reason.

## The oracle gap, for the record

`collateralPrice` is fed by an operator, because Attestcoin proves transactions
and their logs, not prices, and Creditcoin has no price feed. That was verified
rather than assumed: `eth_getCode` returns empty at the standard Pyth, API3 and
RedStone addresses on CC3.

There is a way to close it without adding a centralised oracle, and it uses the
protocol this hackathon is about. The Uniswap V2 **CTC/WETH** pair on Ethereum
mainnet, [`0x93f6a87e…ebda`](https://etherscan.io/address/0x93f6a87eb364bf59b95a1f523a2c23e33c0eebda),
emits `Sync(uint112,uint112)` on every swap, and its reserves *are* the ETH/CTC
ratio that `collateralPrice` wants — no USD leg needed. Attestcoin's testnet
environment already supports Ethereum mainnet as chain key 3, and extracting a
known event from a known address out of a proved transaction is exactly the
shape `VaultEvents.extract` already implements.

Measured at the time of writing: 45,856 CTC / 1.7785 WETH, so 1 ETH = 25,784
CTC, within 1.2% of the centralised-exchange price. Chainlink's ETH/USD feed on
Sepolia ([`0x694AA176…5306`](https://sepolia.etherscan.io/address/0x694AA1769357215DE4FAC081bf1f309aDC325306))
is provable the same way if a USD leg is ever wanted.

**The honest caveat:** that pool holds about 1.78 WETH. It is thin enough to
move cheaply, so this is a demonstration that a cross-chain price can be proved
without an oracle operator, not a collateral pricing scheme safe for real money.
Say it that way if a judge asks.

## Repeating this

```sh
# 1. Lock, and note the tx hash and block
cd contracts && source .env
cast send $SOURCE_VAULT_ADDRESS "lock()" --value 0.0006ether \
  --rpc-url sepolia --private-key $WALLET_PK

# 2. Prove it. This blocks until the block is attested, seven to nine minutes.
cd ../apps/worker && bun run prove <lock-tx-hash> collateral_locked

# 3. Check the lag at any point
bun src/status.ts
```

Then draw and repay, leaving more than `minCycleDuration` between them.
`bun run demo` in `apps/worker` runs the whole thing in one command.

Leftover after this run: 0.0004 Sepolia ETH, ~2000 tCTC. Enough for another
cycle; the Sepolia side is the tighter constraint.
