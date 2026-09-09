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

Both Creditcoin contracts sit behind UUPS proxies; the Sepolia vault does too.
All three are compiled for the London EVM, because CC3 reports `baseFeePerGas`
but no `mixHash` — building for a later target emits opcodes the chain cannot
run, and it only shows up once you are already on-chain.

## How it works

```
Ethereum Mainnet ──┐
  real history     │   Attestcoin          Creditcoin CC3
  (Aave, Lido,     ├──▶ inclusion proof ──▶ ASCCreditLine ──▶ draw / repay
   ERC20 events)   │   (Merkle +            derives limit
                   │    continuity)         tracks draws
Sepolia ───────────┘
  SourceVault
  collateral locked
```

Attestcoin proves **transactions and their event logs** — never balances. Every
input to a credit decision is therefore an observed event, which is why the
score is built from behaviour rather than net worth. That constraint is what
makes this a credit product rather than a wallet.

### What is real, and what is not

| Layer | Status |
| --- | --- |
| Credit history | Real Ethereum Mainnet transactions (`chainKey 3`) |
| Attestcoin verification | Real — full Merkle + continuity proofs |
| Collateral vault | Real contract on Sepolia, testnet value |
| Credit line and draws | Real transactions on Creditcoin CC3 testnet |

Token values are testnet values; the cryptography and the state transitions are
not simulated.

## Layout

```
apps/
  api/        HTTP API — credit scoring
  app/        Cardholder PWA
  web/        Cardholder dashboard
  landing/    Marketing site
  indexer/    Oracle query worker: source events → proofs → Creditcoin
contracts/    Foundry — SourceVault (Sepolia), ASCCreditLine (Creditcoin)
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
  (`chainKey 1`) and Ethereum Mainnet (`chainKey 3`). Nothing else.
- **No state reads.** `EvmV1Decoder` exposes transaction fields, receipt fields
  and logs. There is no storage or account proof, so balances and silently
  accruing yield (Lido rebases, Aave `liquidityIndex`) cannot be attested.
- **Writability is not released.** Creditcoin cannot yet send messages back to
  a source chain, so collateral release is operator-signed for now.
- **Prove early.** Continuity proofs lengthen as attestations are thinned to
  checkpoints; a day-old transaction costs roughly 10× a fresh one.

## Licence

MIT
