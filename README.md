# Comacard

**Your onchain history is your credit line.**

A credit card whose limit is derived from cryptographically proven on-chain
behaviour, while the collateral backing it never leaves the chain it started on.

Built on [Creditcoin](https://creditcoin.org) with the
[Attestcoin Protocol](https://docs.attestcoin.org).

---

## Live on testnet

Everything below is deployed, verified, and working — the numbers in the demo
come off these contracts, not out of a mock.

**Ethereum Sepolia** — where collateral is locked and stays

| | |
| --- | --- |
| SourceVault | [`0x911290c3…3303`](https://sepolia.etherscan.io/address/0x911290c37E9558C704870f4C44CBdEA1B2B33303) |

**Creditcoin CC3 testnet** (chain `102031`) — where credit lives

| | |
| --- | --- |
| ASCCreditLine | [`0x18052272…E906`](https://creditcoin-testnet.blockscout.com/address/0x18052272cC69113DE2b45d2BDB4E1fB287F4E906) |
| CtcStakingAdapter | [`0xA94218Db…7045`](https://creditcoin-testnet.blockscout.com/address/0xA94218Dbdb142A10e32eF7b494105D27F47f7045) |
| WormholeCollateralHub | [`0x9D77f5E1…437f`](https://creditcoin-testnet.blockscout.com/address/0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f) |

**Five more chains** — collateral Attestcoin cannot reach, carried by Wormhole

| | |
| --- | --- |
| Base Sepolia | [`0x7439dff6…6Daf`](https://sepolia.basescan.org/address/0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf) |
| Arbitrum Sepolia | [`0x029ae4ff…7F30`](https://sepolia.arbiscan.io/address/0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30) |
| Optimism Sepolia | [`0xCaBFa324…3e0B`](https://sepolia-optimism.etherscan.io/address/0xCaBFa324576c655D0276647A7f0aF5e779123e0B) |
| BSC Testnet | [`0x9d8B6852…32d6`](https://testnet.bscscan.com/address/0x9d8B6852705dD7585B3907244d603547a4eA32d6) |
| Avalanche Fuji | [`0x7D68B54a…8a1b`](https://testnet.snowtrace.io/address/0x7D68B54a6eDd92F9e6f17E75dbE4d9838cD88a1b) |

Each accepts its chain's native coin, and the two with a canonical USDC accept
that too. All five have taken a real deposit, and all five give it back without
an operator: a `ReleaseRelay` beside each vault holds the role a person used to,
and acts only on a message Creditcoin signed. Adding another chain is a deploy
and two calls.

**Services** — on Railway

| | Base URL | Swagger |
| --- | --- | --- |
| API | https://api-production-1141.up.railway.app | [/docs](https://api-production-1141.up.railway.app/docs) |
| KYC | https://kyc-production-e05a.up.railway.app | [/docs](https://kyc-production-e05a.up.railway.app/docs) |
| Worker | no HTTP surface — it polls Sepolia and submits proofs | |

A frontend only ever talks to the API. It is read-only, has CORS open, and
every number is either read off the chain or off the indexer's copy of it.
One call per screen:

| Call | Gives you |
| --- | --- |
| [`GET /account/{wallet}`](https://api-production-1141.up.railway.app/account/0x3b4f0135465d444a5bd06ab90fc59b73916c85f5) | KYC status, live limit / available / drawn, CTC balance, and the card (active, masked number, account number, expiry) |
| `POST /account/{wallet}/kyc` | Starts Didit, returns `{ sessionId, url }` — send the user to `url` |
| `GET /account/{wallet}/card` | Full card number, CVV, expiry. 404 until KYC is Approved |
| [`GET /account/{wallet}/activity`](https://api-production-1141.up.railway.app/account/0x3b4f0135465d444a5bd06ab90fc59b73916c85f5/activity) | Draws, repayments, collateral locks, defaults — newest first, with explorer tx hashes |
| [`GET /protocol`](https://api-production-1141.up.railway.app/protocol) | Pool liquidity, CTC staking position, collateral price |

```sh
API=https://api-production-1141.up.railway.app
W=0x3b4f0135465d444a5bd06ab90fc59b73916c85f5     # has a limit on testnet

curl $API/account/$W                     # the card screen in one call
curl -X POST $API/account/$W/kyc         # → { sessionId, url }
curl $API/account/$W/card                # 404 until Approved
curl $API/account/$W/activity
curl $API/protocol
```

`card.active` means KYC cleared and nothing is overdue; `card.spendable` is
what `ASCCreditLine.availableOf` will honour right now, which can be zero.
Drawing and repaying are wallet transactions against the contract, not API
calls — see `apps/app/src/lib/creditLine.ts` for the two-function ABI.

The API reaches the KYC service over Railway's private network; the KYC
service keeps its SQLite state on a volume at `/data`. Both build from the
`Dockerfile` in their own directory with the repository root as context.

**Indexer** — both chains in one GraphQL API, hosted on Envio Cloud

    https://indexer.dev.hyperindex.xyz/f7883b8/v1/graphql

Browse it with a schema sidebar and autocomplete, no credentials needed:
[Apollo Sandbox](https://studio.apollographql.com/sandbox/explorer?endpoint=https%3A%2F%2Findexer.dev.hyperindex.xyz%2Ff7883b8%2Fv1%2Fgraphql)

Sepolia syncs through HyperSync; Creditcoin CC3 is not on the supported list so
it reads over plain RPC, which the same indexer handles without noticing.

On the Development plan each deployment gets its own URL and older ones keep
running, so this address changes whenever `main` moves. Anything that consumes
it reads `INDEXER_URL` rather than hardcoding it.

Both Creditcoin contracts sit behind UUPS proxies; the Sepolia vault does too.
All three are compiled for the London EVM, because CC3 reports `baseFeePerGas`
but no `mixHash` — building for a later target emits opcodes the chain cannot
run, and it only shows up once you are already on-chain.

A full credit cycle run against these contracts, with every transaction hash:
[docs/e2e-testnet-run.md](docs/e2e-testnet-run.md).

Recording a demo of this: [DEMO.md](DEMO.md) — the sequence, the exact commands,
and the one timing constraint that will ruin a take if you meet it live.

## How it works

```
Ethereum Mainnet ──┐
  real history     │   Attestcoin          Creditcoin CC3
  (Aave, Lido,     ├──▶ inclusion proof ──▶ ASCCreditLine ──▶ draw / repay
   ERC20 events)   │   (Merkle +            derives limit
                   │    continuity)         tracks draws
Sepolia ───────────┘                            ▲
  SourceVault                                   │
  collateral locked                             │
                                                │
Base · Arbitrum ───┐                            │
Optimism · BSC     ├──▶ Wormhole guardians ──▶ WormholeCollateralHub
Avalanche ─────────┘
  WormholeVault         (signed message)        credits the collateral
  collateral locked
```

Attestcoin proves **transactions and their event logs** — never balances. Every
input to a credit decision is therefore an observed event, which is why the
score is built from behaviour rather than net worth. That constraint is what
makes this a credit product rather than a wallet.

Attestcoin reaches Ethereum and Sepolia, and nothing else. A card that only
takes deposits from one chain is not much of a card, so every other chain
arrives through the one Wormhole component Creditcoin actually has: the Core
Contract. No token bridge, no relayer, no wrapped asset — the deposit stays in a
vault on its own chain and only the message crosses, which is the same promise
the Attestcoin path makes.

### What is real, and what is not

| Layer | Status |
| --- | --- |
| Credit history | Real Ethereum Mainnet transactions (`chainKey 3`) |
| Attestcoin verification | Real — full Merkle + continuity proofs |
| Collateral vault | Real contract on Sepolia, testnet value |
| Credit line and draws | Real transactions on Creditcoin CC3 testnet |
| Cross-chain deposits | Real Wormhole guardian signatures, finalized consistency |

Token values are testnet values; the cryptography and the state transitions are
not simulated.

## Layout

```
apps/
  api/        HTTP API — composes indexer, KYC and chain per wallet
  kyc/        KYC service — Didit sessions and webhook intake
  app/        Cardholder app — Next.js, wagmi; KYC, draw, repay
  web/        Cardholder dashboard
  landing/    Marketing site
  indexer/    Oracle query worker: source events → proofs → Creditcoin
contracts/    Foundry — SourceVault (Sepolia), ASCCreditLine (Creditcoin),
              WormholeVault (everywhere else)
packages/
  attestcoin/ Attestcoin chain constants and proof types
  core/       Domain model — money, attested events, scoring
  tsconfig/   Shared TypeScript configuration
```

## Getting started

Requires [Bun](https://bun.sh) ≥ 1.3 and [Foundry](https://getfoundry.sh).

```sh
bun install
cp .env.example .env      # fill in RPC URLs
bun run test
bun run dev
```

Contracts:

```sh
cd contracts
forge install foundry-rs/forge-std --no-git
forge build && forge test
```

## Notes on the protocol

Facts verified against `@gluwa/asc-contracts@0.2.1` and the Attestcoin docs:

- **Source chains are limited.** CC3 testnet attests Ethereum Sepolia
  (`chainKey 1`) and Ethereum Mainnet (`chainKey 3`). Nothing else — which is
  why anywhere else arrives by Wormhole.
- **Creditcoin has Wormhole Core and nothing more.** No token bridge, no
  automatic relayer, so fetching a signed message and delivering it is our own
  job. The vaults publish at finalized consistency, and that is not the same
  wait everywhere: the L1s sign in under a minute, the L2s take fifteen to
  twenty because they finalize against Ethereum.
- **No state reads.** `EvmV1Decoder` exposes transaction fields, receipt fields
  and logs. There is no storage or account proof, so balances and silently
  accruing yield (Lido rebases, Aave `liquidityIndex`) cannot be attested.
- **Writability is not released.** Creditcoin cannot yet send messages back to
  a source chain, so collateral release is operator-signed for now.
- **Prove early.** Continuity proofs lengthen as attestations are thinned to
  checkpoints; a day-old transaction costs roughly 10× a fresh one.

## Licence

MIT
