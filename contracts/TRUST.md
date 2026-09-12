# What this trusts

Comacard lends against collateral that stays where it is. Nothing in it is
custodial by accident, and the places where somebody has to be trusted are here
rather than spread through the code — because a system that hides its trust
assumptions is not safer, only quieter about it.

Read this before deciding what the demo is claiming.

## The one sentence

**Collateral is trustless in both directions on the five Wormhole chains, and
trustless inbound but operator-approved outbound on Ethereum.** The asymmetry is
not a design choice; Attestcoin writability is in third-party audit and has not
shipped, so Creditcoin cannot yet write back to Ethereum.

## What Attestcoin actually proves

It proves that **a transaction happened and what events it emitted**. Nothing
else. `EvmV1Decoder` exposes transaction fields, receipt fields and logs; there
is no storage proof and no account proof.

That constraint shaped the product rather than inconveniencing it. Every input
to a credit decision here is a counted event, which is why the score is built
from behaviour instead of net worth — a balance cannot be proved, so it is not
used. A protocol that wanted to lend against wealth could not be built on this
and should not pretend otherwise.

Two consequences worth stating plainly:

- **Silently accruing yield cannot be attested.** Lido rebases and Aave's
  `liquidityIndex` change no state that emits an event, so they are invisible
  here no matter how much they are worth.
- **The proof binds a chain through the transaction's own signed `chainId`**,
  not through the address that emitted it. Addresses repeat across chains via
  CREATE2; signatures do not.

## Who is trusted, and for what

| | Trusted for | Bounded by |
| --- | --- | --- |
| Attestcoin's block prover | That a Sepolia or mainnet transaction occurred | The precompile; we verify nothing ourselves |
| Wormhole's guardians | That a message came from the contract it claims | **One signature on testnet**, 13 of 19 on mainnet |
| The operator (`ORACLE_ROLE`) | Collateral prices | Cannot move funds; prices only |
| The operator (`OPERATOR_ROLE`) | Releasing Ethereum collateral, moving pool liquidity | Cannot touch the Wormhole path |
| Governance (`DEFAULT_ADMIN_ROLE`) | Upgrades, listing assets, naming vault peers | A two-step, delayed admin handover |
| The staking adapter's account | Bonded CTC | `deployedPrincipal` is the exact size of it |
| **Nobody** | Releasing Wormhole collateral | A contract relays what was signed |

The last row is the one that changed today. `WormholeVault.approveRelease` is
operator-gated, and the operator used to be us. It is now a `ReleaseRelay`
contract that approves nothing of its own accord.

### The guardian set is one, and that matters

Every VAA this project has delivered carries a **single** guardian signature.
Wormhole's testnet guardian set has one member; the 13-of-19 threshold people
quote is mainnet. Parse any of our messages and the sixth byte — the signature
count — reads `1`.

So on this deployment the Wormhole leg rests on one key. That is a property of
the testnet rather than of the design, and the same contracts against mainnet
Wormhole would inherit 13-of-19 unchanged. But it is not what a reader assumes
when they see "Wormhole", and claiming guardian security without the number
would be borrowing credibility the deployment has not got.

The Attestcoin leg does not share this: its proofs are verified by Creditcoin's
own block prover precompile, which is the same one mainnet uses.

## Prices are fed, not proved

`collateralPrice` and every `TokenConfig.price` are set by `ORACLE_ROLE`.
Attestcoin proves transactions, not prices, and Creditcoin has no feed. On a
testnet with faucet assets this is honest; on mainnet it is the single largest
thing that would need replacing, and no amount of care elsewhere substitutes for
it.

The bound on the damage is that the role can only price, never move funds.

## The staking adapter is custodial

Bonding CTC is a Substrate operation and only EVM accounts can call contracts,
so there is no trustless path from a contract to a validator today. Liquidity
deployed into the adapter is held by an account we control. `deployedPrincipal`
reports exactly how much that is, and it is deliberately readable.

Only pool liquidity is staked. A borrower's collateral is never deployed.

## What is bounded, and where

- `MAX_TOKENS` 16 and `MAX_ASSETS` 32. Every limit check walks both lists, so
  these are a gas ceiling as much as a policy. Measured at the cap: 484,315 gas
  to read a limit, 741,474 to draw. `test/unit/ScaleLimits.t.sol` keeps that
  honest.
- Releases and deposits both publish at **finalized** consistency. An L2 waits
  on Ethereum finality — fifteen to twenty minutes — and the two L1s sign in
  under one. Instant consistency would be faster and would mean crediting
  collateral a reorg could take back.
- A withdrawal is three transactions on two chains, and the last is the
  borrower's. The relay approves; it never pushes funds.

## Four bugs, one shape

Every bug found in the cross-chain work was **a plural treated as singular**,
and three of the four were found by exercising the system rather than reading
it:

1. `ReleaseRelay` did not check which chain a release was for, so one signed
   release executed on all five. Worse than a duplicate: the amount is the same
   on every chain and the asset is not, so 0.2 AVAX became 0.2 BNB elsewhere.
2. `approveRelease` sets rather than adds, so two withdrawals in flight left the
   second overwriting the first — debited on Creditcoin, unclaimable on the far
   chain.
3. The indexer's chain map held two of five chains, and the handler returned
   quietly on the rest. Every dashboard read healthy while three chains produced
   no rows.
4. A withdrawal's far-chain stages were matched against a request that had not
   been indexed yet, because the chains do not sync in step.

The general form, which is worth more than the four fixes:

> If a check involves "which one of several", a fixture with one of them cannot
> test it.

The suites now carry two relays, two chains, two concurrent withdrawals, and the
token case separately from the native one.

## Not audited

This is hackathon work. It has 177 tests, 95% line coverage on the contracts and
100% on both Wormhole contracts, and it has been exercised end to end on seven
live chains — none of which is an audit, and the four bugs above were all found
in a single day of looking.
