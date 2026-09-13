# @comacard/worker

The only thing in the repo that moves proofs across chains without a person. Owned by Fajar
(`FjrREPO`). Runs as a Railway service; the same code is also the CLI you reach for by hand.

```bash
bun run start                 # the daemon: both loops
bun run prove <txHash> <kind> # Attestcoin, blocks until the block is attested
bun run relay <chainId> <seq> # Wormhole, one message
bun run roundtrip [chainId]   # the whole cross-chain story, one command
bun run status                # current attestation lag
```

## Two loops, deliberately not awaited together

`src/index.ts` runs the Attestcoin watcher and the Wormhole relay side by side, and the relay is
deliberately **not** awaited into the same chain of promises. The two carriers have completely
different latencies — 7–9 minutes against under one, or fifteen to twenty on L2s — and a crash in
one must not take the other down.

Before `462c494` the Dockerfile ran only the Sepolia watcher; `relay watch` existed and nothing
called it, so every cross-chain deposit sat signed and undelivered until someone typed a command.
**That change needs a Railway redeploy to take effect** — same entrypoint, same env — and if it has
not happened, the symptom is a nonce of zero on the operator address and deposits that never land.

## `roundtrip` exists because hand-typed commands lie

`bun run roundtrip 4` does the lot against the live contracts — lock, guardians, credit, request,
relay, claim — and reads every figure off a contract rather than computing it in the script.

It was written after two of the equivalent `cast` commands in `DEMO.md` turned out to be wrong in
ways that failed silently: a release **too small to strand a debt**, so the refusal being
demonstrated simply did not happen and the command succeeded showing nothing; and a repayment
**larger than the debt**, which `repay()` refuses rather than refunding, costing a transaction.

Use `4` (BSC) or `6` (Fuji) for anything recorded. They are L1s and sign in under a minute; the three
L2s finalize against Ethereum and take fifteen to twenty.

## A send is not a delivery

Two RPC behaviours that produce false successes, both measured on these chains:

- **`tx.wait()` resolves to `null` without throwing** when no receipt is available. Awaiting it alone
  reports a delivery that never happened — worse than a failure, because the sweep marks it done and
  never retries.
- **A status-1 receipt is not proof.** The Fuji and Arbitrum public RPCs both returned one for
  transactions `eth_getTransactionReceipt` afterwards reported as unknown.

So the worker treats a send as *submitted*, and only the relay answering `AlreadyConsumed` as
*delivered*. Anything here that confirms a user action from a receipt alone has the same hole; the
honest test is reading back the state the transaction was supposed to change.

## `getLogs` fails differently on every chain

Same bug, two symptoms, and recognising one does not prepare you for the other:

- **Creditcoin** times out silently after about forty seconds on `fromBlock: 0`.
- **Base Sepolia** rejects loudly: `413`, `eth_getLogs is limited to a 10,000 range`.

Every scan is chunked. 5,000-block windows answer in about a second on Creditcoin.

## Vault quirks that are easy to copy wrong from the Sepolia path

- **`WormholeVault.lockToken` is payable** where `SourceVault.lockToken` is not — the Wormhole
  message fee rides on the same call.
- **`lockNative` credits `msg.value - fee`**, so locking exactly N means sending N plus the fee. The
  fee comes off first because crediting the full `msg.value` would credit collateral the vault is not
  holding. `messageFee()` is currently **0** on these testnets, which makes it worse rather than
  better: it will work fine in testing and break the day a chain sets a fee. Read it, never assume it.
- **The native getter is `nativeBalanceOf`, and the token one is `tokenBalanceOf`** — neither is
  `balanceOf`. One contract holds both kinds, so a single name would have to overload.

## `src/config.ts` is a list other places must match

`vaults` maps Wormhole chain id → name, RPC and vault address, and it is mirrored by tests in
`apps/api` and `apps/app`. **BSC is `4` and Fuji is `6`** — they predate Wormhole's 10000-block
testnet scheme — while Base, Arbitrum, Optimism are 10004, 10003, 10005. Extrapolating the sequence
puts Fuji at 10006, which is Holesky.

## Delivery is permissionless, and that is a feature

`WormholeCollateralHub.receiveFromWormhole(bytes vaa)` is `external` with no role gate. It verifies
the VAA, matches the emitter against a registered peer, and refuses a replay. The recipient is inside
the signed message, so **anyone can submit it and the collateral still lands on the right wallet** —
which is what makes a stuck deposit recoverable by hand while the daemon is down.
