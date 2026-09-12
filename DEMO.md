# Recording the demo

Everything below runs against the deployed contracts. No mocks, no staging —
the numbers on screen are the numbers on chain, and a judge can open every hash.

## The one thing that will ruin the take

**Nothing crosses a chain quickly.** Two different waits, both long enough to
kill a recording:

| Path | Wait | Why |
| --- | --- | --- |
| Attestcoin (Sepolia) | 7–9 min | Creditcoin has to attest the block first |
| Wormhole (Base, Arbitrum) | ~15 min | The vault publishes at finalized, and an L2 finalizes against Ethereum |

So: **lock every piece of collateral before you start recording.** Prove it on
camera, or prove it beforehand and show the result. Either reads fine; waiting
does not. The Wormhole deposit especially — start it first, it is the slowest
thing in the demo.

Check the lag before you begin:

```sh
cd apps/worker && bun src/status.ts
```

## Before you press record

`contracts/.env` needs `WALLET_PK`, `SOURCE_VAULT_ADDRESS` and
`ASC_CREDIT_LINE_ADDRESS` — the commands below read all three.

```sh
cd contracts && source .env

# 1. Lock collateral now, so the proof is ready when you need it
cast send $SOURCE_VAULT_ADDRESS "lock()" --value 0.002ether \
  --rpc-url sepolia --private-key $WALLET_PK
# note the tx hash and block

# 2. Deposit from another chain too — this one is the slowest, so start it early
cast send 0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf "lockNative()" \
  --value 0.01ether --rpc-url base_sepolia --private-key $WALLET_PK
# note the sequence from the Locked event

# 3. Wait out both while you set up your shot
cd ../apps/worker && bun src/status.ts       # attestation lag
bun run relay 10004 <sequence>               # blocks until the guardians sign
```

Have these open in tabs, ready to switch to:

| Tab | What it shows |
| --- | --- |
| [Sepolia vault](https://sepolia.etherscan.io/address/0x911290c37E9558C704870f4C44CBdEA1B2B33303) | The collateral, sitting on Ethereum |
| [Creditcoin credit line](https://creditcoin-testnet.blockscout.com/address/0x18052272cC69113DE2b45d2BDB4E1fB287F4E906) | Verified source, every call |
| `apps/indexer/graphiql.html` | Query it live |
| `apps/indexer/explorer.html` | The same data as plain tables |
| [Base Sepolia vault](https://sepolia.basescan.org/address/0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf) | Collateral on a chain Attestcoin cannot see |
| [Wormholescan](https://wormholescan.io/#/?network=Testnet) | The signed message, mid-flight |

## The sequence

### 1 — The problem (0:00–0:20)

Say it plainly: someone with no credit history cannot borrow. Not because they
are a bad risk — because nobody can see their record.

Do not show a slide of statistics. Say the sentence and move.

### 2 — Collateral that never moves (0:20–0:50)

Show the Sepolia transaction locking ETH.

```sh
cast call $SOURCE_VAULT_ADDRESS "balanceOf(address)(uint256)" $YOUR_ADDRESS \
  --rpc-url sepolia
```

The line to land: *the ETH stays on Ethereum. It is never bridged, never
wrapped, never held by us.*

### 3 — The proof crossing (0:50–1:30)

```sh
cd apps/worker
bun run prove <lock-tx-hash> collateral_locked
```

Then show the credit appearing on the other chain:

```sh
cast call $ASC_CREDIT_LINE_ADDRESS "limitOf(address)(uint256)" $YOUR_ADDRESS \
  --rpc-url creditcoin
```

Worth saying out loud: Attestcoin proves the *transaction*, cryptographically.
Creditcoin is not trusting a bridge, an oracle operator, or us.

### 4 — History becomes credit (1:30–2:00)

The differentiator. Prove a real Ethereum mainnet transaction and watch the
score move:

```sh
bun run prove <mainnet-tx-hash> history
```

We ran this against a wallet with 18,206,166 transactions. Its score went to 40
— and its limit stayed at zero, because it had posted no collateral. Say that
out loud: **a busy wallet is still a stranger.** History earns a better rate,
never a free loan.

### 4b — More than one asset (optional, strong)

Lock a stablecoin and watch the limit jump. Lock it before recording — it waits
on attestation like any other lock.

```sh
cast send $tUSDC "faucet(uint256)" 1000 --rpc-url sepolia --private-key $WALLET_PK
cast send $tUSDC "approve(address,uint256)" $SOURCE_VAULT_ADDRESS 500000000 \
  --rpc-url sepolia --private-key $WALLET_PK
cast send $SOURCE_VAULT_ADDRESS "lockToken(address,uint256)" $tUSDC 500000000 \
  --rpc-url sepolia --private-key $WALLET_PK
bun run prove <lock-tx-hash> token_locked
```

We ran it: 500 tUSDC took the limit from 8.39 to 427.85 CTC. The line worth
saying is about decimals — USDC has 6, ETH has 18, and valuing one as the other
is off by a trillion with no error to warn you.

### 4c — Deposit from any chain (optional, strong)

This is the one that answers "so it only works on Ethereum?". Show the deposit
you made on Base Sepolia before recording, then show it credited on Creditcoin.

```sh
cd apps/worker
bun run relay 10004 <sequence>   # already signed by now; submits and returns a tx
```

The point to make in one sentence: **the ETH never left Base.** It is sitting in
a vault there; what crossed was a message the Wormhole guardians signed, exactly
like the Attestcoin path. Comacard does not operate a bridge and does not mint a
wrapped asset, because the most-exploited component in the industry is not one
worth adding to a credit product.

Worth naming while it is on screen: assets are keyed by chain *and* address, so
USDC on Base and USDC on Arbitrum are two different assets. They are held in
different vaults and a depeg on one says nothing about the other.

### 5 — The moment (2:00–2:40)

```sh
bun run demo --no-lock
```

One command: draw, hold, repay. It prints the before-and-after itself.

```
score   42  →  44
limit   8.291874 CTC  →  8.389262 CTC
```

There is a 70-second hold in the middle — cut it. It exists because a cycle
opened and closed in one block proves nothing about a borrower, and that guard
is worth a sentence while the cut plays.

### 6 — It is all real (2:40–3:00)

Open the indexer and query it live. Then the closing line:

> Repaying on time raised the limit. Everything you just saw is on two public
> testnets, and you can run it yourself.

## Numbers you can promise

The limit is arithmetic, not a black box, and saying so is stronger than showing
another chart:

| Score | Collateralisation | Limit on 10 CTC of collateral |
| --- | --- | --- |
| 0 | 150% | 6.666666666666666666 CTC |
| 42 | 120.6% | 8.291873963515754560 CTC |
| 44 | 119.2% | 8.389261744966442953 CTC |
| 100 | 80% | 12.5 CTC exactly |

## What not to claim

Say these before a judge asks. Being first to name a limitation reads as
competence; being caught reads as the opposite.

- **The collateral price is operator-fed.** Attestcoin proves transactions, not
  prices, and Creditcoin has no feed. It sits behind its own role, and that is
  the bound on the damage — not an oracle.
- **The staking adapter is custodial.** Bonding CTC is a Substrate operation and
  only EVM accounts can call contracts, so there is no trustless path today.
  `deployedPrincipal` is the exact size of the trust.
- **Collateral release is operator-approved.** Attestcoin writability is still
  in audit, so Creditcoin cannot release funds on Sepolia by itself.
- **`minCycleDuration` is 60 seconds here, not the one-day default**, so the
  loop fits in a recording.
- **Cross-chain deposits are relayed by us.** Creditcoin has Wormhole Core and
  nothing else — no token bridge, no automatic relayer — so somebody has to hand
  the signed message over. The submit call is permissionless, so a borrower can
  do it themselves, but today it is our worker that does.
- **Two chains are live, not every chain.** Base Sepolia and Arbitrum Sepolia
  have vaults deployed. The contract is chain-agnostic and adding another is a
  deploy and two calls, but say "two" rather than "any" unless you have deployed
  the third.

## If something breaks on camera

- *Proof fails with a revert* — the block is not attested yet. `bun src/status.ts`
  and wait. Nothing is wrong.
- *A draw reverts* — the pool ran dry. Top it up: `cast send $ASC_CREDIT_LINE_ADDRESS
  "fund()" --value 50ether --rpc-url creditcoin --private-key $WALLET_PK`
- *`relay` sits there and nothing happens* — the guardians have not signed yet.
  Fifteen minutes from the deposit, not from when you started waiting. Check
  https://wormholescan.io/#/?network=Testnet for the message.
- *The indexer shows an old limit* — it caches per account and refreshes on that
  account's next event. Read `limitOf` from the contract for a live figure.
