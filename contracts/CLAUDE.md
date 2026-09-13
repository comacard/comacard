# contracts

Foundry, Solidity 0.8.28, `via_ir`, **London EVM target**. Owned by Fajar (`FjrREPO`).

```bash
forge test                    # 201 tests
forge coverage                # branch 83.58%, functions 100%
forge build --sizes           # the number that matters most, see below
```

## The ceiling you will hit before any other

**`ASCCreditLine` has about 913 bytes left** of the 24,576-byte runtime limit. That is not a
guideline, it is the reason the architecture looks the way it does: an earlier attempt to put the
cross-chain receive path inline compiled to 26,701 bytes, and dropping optimizer runs to 1 still
left it 1,172 over.

So **anything new goes beside `ASCCreditLine`, not inside it.** Measured with `forge build --sizes`:

```
ASCCreditLine          23,663      margin    913   ← the one to watch
WormholeCollateralHub  12,838      margin 11,738
ReleaseRelay            3,945      margin 20,631
WormholeVault           4,324      margin 20,252
```

There is room beside the line and effectively none inside it. The credit line reaches the hub through
two lines at storage slot 11:

```solidity
address hub = remoteCollateralHub;
if (hub != address(0)) value += IRemoteCollateral(hub).valueOf(who);
```

Run `forge build --sizes` before proposing anything that adds to the line.

## Two carriers, deliberately unequal

| | Attestcoin | Wormhole |
| --- | --- | --- |
| Chains | Sepolia, Ethereum mainnet | Base, Arbitrum, Optimism, BSC, Fuji |
| Inbound | trustless | trustless |
| Outbound | **operator-approved** | trustless |
| Latency | 7–9 min | <1 min on L1s, 15–20 on L2s |

The outbound asymmetry is not an oversight. Attestcoin *writability* is still in third-party audit,
so Creditcoin cannot write back to Ethereum, and `SourceVault.approveRelease` is gated on us. The
Wormhole leg has `ReleaseRelay` holding that role instead, and it approves nothing of its own
accord — it relays what the guardians signed, and they only sign what Creditcoin published after
checking the debt.

`TRUST.md` is the full write-up and every claim in it was checked against the code and the chain.
The one people get wrong: **Wormhole's testnet guardian set has one member.** 13-of-19 is mainnet.

## `ASCCreditLine` is bound to one source chain, on purpose for now

`sourceVault` and `sourceChainKey` are written once in `initialize` and there is no setter. Read them
on the live contract and `sourceChainKey` is still `1`. Issue #4 specs the registry that would lift
it, and it is parked rather than abandoned: Attestcoin can only *produce* proofs for two chains, both
Ethereum, so a registry would be correct code that left a Base user exactly as stuck. It becomes the
right change the day Attestcoin attests a third chain.

If you do build it, #4 records the trap: **`ASCBase.execute` verifies `chainKey` and then does not
forward it** to `_processAndEmitEvent`, so a handler cannot tell which chain a proof came from.
Binding vault addresses is not enough either — CREATE2 puts the same address on every chain. The
technique that works is already in `HistoryProof`: read the EVM `chainId` back out of the decoded
transaction, where the transaction's own signature covers it.

## Things that are load-bearing rather than stylistic

**`minCycleDuration` is 60 seconds on the deployed contract**, not the 1-day default. A draw repaid
faster scores nothing, silently.

**Only a repayment that clears the balance closes a cycle.** Partials reduce debt and earn no mark.

**`repay()` refuses an overpayment rather than refunding it**:

```solidity
if (msg.value > outstanding) revert RepaymentExceedsDebt(msg.value, outstanding);
```

Any caller must read `accountOf(wallet).drawn` immediately before sending and use it verbatim. A
figure that is even slightly stale reverts, and it goes stale exactly when someone has just drawn.

**A release names its destination chain inside the signed payload.** It did not, for about an hour,
and one signed release was executable on all five relays — 0.2 AVAX (5 CTC) replayed on BSC approved
0.2 BNB (120 CTC). The relay now compares the payload's chain against its own `WORMHOLE.chainId()`.

**A release is version 2 of the same payload a deposit uses**, and the version byte leads. A vault
that predates releases refuses one as an unsupported version rather than reading it as a deposit.
Both directions are tested, because the two differ in one byte and the failure mode is paying out
against a deposit message.

## Tests

`test/unit/ActionDispatch.t.sol` covers all five `_processAndEmitEvent` routes, the unknown-action
revert, and the enum ordinals **written out as literals** — deriving them from the enum would agree
with any reordering. `packages/attestcoin/test/action-parity.test.ts` guards the same ordinals from
the TypeScript side. Two languages, two tests, because a reorder once cost a mainnet proof that had
already been paid for.

`test/unit/Guards.t.sol` takes the refusals: zero amounts, the zero address, an empty payment, a
release to a chain with no vault, an unpaid message fee, the asset registry's ceiling. None is
interesting alone; together they are the difference between "the happy path works" and "it refuses
what it says it refuses".
