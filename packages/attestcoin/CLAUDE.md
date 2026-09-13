# @comacard/attestcoin

What Attestcoin can and cannot do, as types and constants. No runtime, no network calls — this
package exists so the rest of the repo stops re-deriving the same three facts.

```bash
bun run test        # test/action-parity.test.ts is the whole point
```

## The constraint the product is built around

Attestcoin reads **transactions and their event logs** from a source chain and proves them on
Creditcoin. It cannot read balances or contract storage — `EvmV1Decoder` exposes transaction fields,
receipt fields and logs, and nothing else.

That is why Comacard is credit rather than custody: every input to a credit decision has to be an
observed *event*, so the score is built from behaviour. It is also why silently accruing yield is
invisible to it — nothing emits when a balance grows.

## Two chains, and that number drives an architecture

```ts
CHAIN_KEY = { sepolia: 1, mainnet: 3 }
```

CC3 testnet attests Ethereum Sepolia and Ethereum mainnet. Nothing else, today.

Everything downstream follows from it: a `sourceChains` registry on `ASCCreditLine` would be correct
code that left a Base user exactly as stuck, because the carrier — not the contract — is the limit.
Wormhole is beside it for that reason. See the root `CLAUDE.md`.

**`chainKey` is not an EVM chain id.** `chainKey` 1 is Sepolia; EVM 11155111 is Sepolia. Nor is it a
Wormhole chain id. Three numbering systems meet in this repo and mixing them is the single most
likely bug — the root `CLAUDE.md` has the table.

## `action-parity.test.ts` has earned its keep twice

The action ordinals exist in two languages: a Solidity enum and `ASC_ACTION` here. Nothing in the
compiler ties them together, so the test reads the enum out of the Solidity source and compares.

It was written after `historyImported` was `4` in TypeScript and `2` in Solidity, which cost a
mainnet proof that had already been generated and paid for. It caught the same drift again when the
enum grew `TokenLocked` and `TokenUnlocked`.

`contracts/test/unit/ActionDispatch.t.sol` guards the Solidity side of the same fact, with the
ordinals written as literals rather than derived — deriving them would agree with any reordering.
Two tests, two languages, because a reorder credits a token lock as a native one in production and
nothing throws.
