# Contracts

The onchain half of Comacard: a revolving credit line whose limit comes from a
borrower's proven track record rather than from the balance in their wallet.

Collateral is locked on Ethereum and never moves. Attestcoin proves those
locks — and the borrower's history on mainnet — across to Creditcoin, where the
credit line reads them, sizes a limit, and lends against it. Repay on time and
the limit grows; let a debt lapse and anyone can close it as a default, which
costs the borrower that limit.

## Deployed

| Contract | Chain | Address |
| --- | --- | --- |
| `SourceVault` | Ethereum Sepolia | [`0x911290c37E9558C704870f4C44CBdEA1B2B33303`](https://sepolia.etherscan.io/address/0x911290c37E9558C704870f4C44CBdEA1B2B33303) |
| `ASCCreditLine` | Creditcoin CC3 (`102031`) | [`0x18052272cC69113DE2b45d2BDB4E1fB287F4E906`](https://creditcoin-testnet.blockscout.com/address/0x18052272cC69113DE2b45d2BDB4E1fB287F4E906) |
| `CtcStakingAdapter` | Creditcoin CC3 (`102031`) | [`0xA94218Dbdb142A10e32eF7b494105D27F47f7045`](https://creditcoin-testnet.blockscout.com/address/0xA94218Dbdb142A10e32eF7b494105D27F47f7045) |

All three are UUPS proxies. Sepolia is verified on Etherscan; the implementation
behind the vault is [`0x6981E1453c80D0E774145f20876D9F57ADfD2bbC`](https://sepolia.etherscan.io/address/0x6981E1453c80D0E774145f20876D9F57ADfD2bbC).

Exercised end to end on-chain: the pool was funded, liquidity deployed into the
adapter and delegated toward staking, and every guardrail — drawing without
collateral, defaulting a non-borrower, and each privileged call from an
unauthorised address — was confirmed to revert on the live contracts.

### Collateral assets

Native ETH plus three ERC20s on Sepolia. Anyone can mint the test tokens from
their `faucet(uint256 wholeTokens)` — they stand in for the real assets so the
multi-asset path can be exercised without real funds.

| Asset | Decimals | Priced at | Sepolia address |
| --- | --- | --- | --- |
| ETH (native) | 18 | 1,000 CTC | — |
| tUSDC | 6 | 1 CTC | [`0x2eECfA1eb55154483726314235f74ac324e2660F`](https://sepolia.etherscan.io/address/0x2eECfA1eb55154483726314235f74ac324e2660F) |
| tUSDT | 6 | 1 CTC | [`0xc370A0BC9db78d031c076b2fBEcCCb5f3291AB00`](https://sepolia.etherscan.io/address/0xc370A0BC9db78d031c076b2fBEcCCb5f3291AB00) |
| tWETH | 18 | 1,000 CTC | [`0xC27FCc0A2547298d0ec86f7f70748Cc3CFC18da1`](https://sepolia.etherscan.io/address/0xC27FCc0A2547298d0ec86f7f70748Cc3CFC18da1) |

### Tokens on Creditcoin testnet

| Token | Decimals | Address | What it is |
| --- | --- | --- | --- |
| WCTC | 18 | [`0xc60f71E2814E45921e57Ea32a4ee36d5E73d3b29`](https://creditcoin-testnet.blockscout.com/address/0xc60f71E2814E45921e57Ea32a4ee36d5E73d3b29) | Native CTC as an ERC20 |
| USDT.C | 6 | [`0x0e1d5478d3061923Ed47DdB4146F037Da4E63dAD`](https://creditcoin-testnet.blockscout.com/address/0x0e1d5478d3061923Ed47DdB4146F037Da4E63dAD) | Testnet stand-in |

`WrappedCTC` is a real WETH-style wrapper: every token is backed one to one by
native CTC held in the contract, and the fuzz test asserts supply never diverges
from that balance. It is **not** a bridge. On mainnet the WCTC symbol belongs to
a Wormhole NTT deployment that genuinely moves CTC to Ethereum and BSC; this
one wraps CTC on the same chain so ERC20-only contracts can hold it.

`BridgedUSDT` is a stand-in and nothing more. Real Creditcoin Bridged USDT
exists only on mainnet, carried there by NTT; there is no testnet counterpart,
which is why this exists. Anyone can mint it from `faucet`, and that open mint
is the plainest signal it is not the bridged asset — a bridged token can only
come into existence by bridging.

Prices are operator-set testnet figures on a 1 CTC ≈ $1 model, not market
quotes. The decimals column is the one that matters for correctness: a 6-decimal
stablecoin valued as if it had 18 would count for a trillionth of itself.

## Layout

```
src/
  types/        CreditTypes.sol       shared structs, enums, errors
  interfaces/   ICreditLine.sol       external surfaces, natspec documented
                ISourceVault.sol
                IYieldAdapter.sol
  libraries/    CreditScoring.sol     pure scoring maths
                VaultEvents.sol       proved-log decoding + emitter checks
                HistoryProof.sol      chain-pinned external track record
  governance/   Governed.sol          roles, pause, freeze, UUPS authority
  source/       SourceVault.sol       source chain (Ethereum Sepolia)
  creditcoin/   ASCCreditLine.sol     the ASC, extends Gluwa's ASCBase
                CtcStakingAdapter.sol native CTC staking, operator-mediated
script/                               UUPS proxy deployments, per chain
test/unit/                            one suite per unit
test/helpers/                         proxy deployers, tx fixtures, harnesses
vendor/attestcoin/                    Gluwa contracts, vendored (see its README)
```

## Deployment shape

| Chain | Contract | Role |
| --- | --- | --- |
| Ethereum Sepolia (`chainKey 1`) | `SourceVault` | Holds collateral, emits the events Creditcoin proves |
| Ethereum Mainnet (`chainKey 3`) | — | Read-only: existing events become credit history |
| Creditcoin CC3 | `ASCCreditLine` | Verifies proofs via `ASCBase`, derives the limit, tracks draws |
| Creditcoin CC3 | `CtcStakingAdapter` | Earns on idle liquidity through native NPoS |

## Protocol constraints these contracts are shaped by

Verified against `asc-contracts` v0.2.1 and the Attestcoin documentation:

- **No state reads.** `EvmV1Decoder` exposes transaction fields, receipt fields
  and logs — nothing else. Balances and silently accruing yield (Lido rebases,
  Aave's `liquidityIndex`) cannot be attested, so every credit input here is a
  counted *event*. This is why the product is credit rather than custody.
- **One direction.** Attestcoin writability is still in audit, so Creditcoin
  cannot release source-chain collateral. `SourceVault` withdrawal is therefore
  operator-approved, and is meant to become proof-gated once writability ships.
- **No staking precompile.** Bonding CTC is a Substrate operation and only EVM
  accounts can call contracts, so `CtcStakingAdapter` is operator-mediated by
  necessity. `deployedPrincipal` is the exact size of that trust.
- **`via_ir` is required.** `EvmV1Decoder`'s structs overflow the stack without
  it. Do not turn it off.

## The credit cycle

A draw opens a cycle with a due date. Repaying in full closes it and earns a
mark on the record; letting it run past the due date lets **anyone** call
`markDefaulted`, which writes the debt off against the collateral and closes the
cycle *without* a repayment. That asymmetry is what gives the score meaning — a
default costs the borrower their limit.

Two things the scoring deliberately refuses:

- **A cycle shorter than `minCycleDuration` earns nothing.** Otherwise ten
  draw/repay pairs in one block would buy a spotless record for the price of gas.
- **External history alone caps out at 40 points.** A busy mainnet wallet that
  has never repaid anything here is still a stranger, and still overcollateralised.

`repay` is deliberately not pausable: a pause stops new borrowing, but a
borrower who cannot clear a debt while the clock runs toward default would be
punished for something they had no way to prevent.

## The cycle, run on the live contracts

One full pass, on Sepolia and Creditcoin CC3, with every figure read back off
the chain:

```
lock 0.01 ETH on Sepolia          0x5d75d6c4…3555a
prove it to Creditcoin            0xc8cc9934…e8ef    collateral credited
                                                     score 0 → limit 6.666 CTC

draw 5 CTC                        0x5759063d…a52e    available 6.666 → 1.666
hold 75s, repay 5 CTC in full     0x3ab1d85f…20c8    cycle closed

                                                     score 0 → 42
                                                     limit 6.666 → 8.291 CTC
```

The limit is arithmetic anyone can redo: a score of 42 asks for 120.6%
collateralisation, and 0.01 ETH priced at 1000 CTC is 10 CTC of value, so
`10 × 10000 / 12060 = 8.291873963515754560`. The chain agrees to the wei, and so
does the indexer.

Then a second asset, on the same account:

```
lock 500 tUSDC on Sepolia         0x0f1b9e2e…f610
prove it to Creditcoin            0x12563f58…86eb    500 tUSDC credited

                                                     collateral 10 → 510 CTC
                                                     limit 8.389 → 427.852 CTC
```

The number that proves the decimals are handled: 500 tUSDC is 500,000,000 base
units at 6 decimals. Valued as though it had 18, it would be worth
0.0000000005 CTC and nothing would revert — the limit would simply be wrong.
Scaled by its own decimals it is exactly 500 CTC, and the limit
`510 × 10000 / 11920 = 427.852348993288590604` matches the chain to the wei.

`minCycleDuration` is set to **60 seconds on this testnet deployment** so the
loop can be demonstrated inside a recording. The default is a day, and it exists
because a cycle opened and closed in one block proves nothing about a borrower.

## Governance

Roles are separated so no single key both runs operations and changes rules:

| Role | May |
| --- | --- |
| `DEFAULT_ADMIN_ROLE` | Grant roles, change configuration, authorise upgrades, unpause |
| `OPERATOR_ROLE` | Move liquidity, approve releases |
| `GUARDIAN_ROLE` | Pause, and nothing else |
| `COMPLIANCE_ROLE` | Freeze an account, and nothing else |

Halting is easy; restarting requires governance. A freeze stops movement but
never confiscates — balances and records survive it.

All three contracts are UUPS proxies; upgrades are governance-only.

## Usage

```sh
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
forge install OpenZeppelin/openzeppelin-contracts-upgradeable@v5.4.0 --no-git

forge build
forge test
forge coverage --no-match-coverage 'script|test|vendor'
```

### Verifying on Creditcoin

`--verify` during deployment only covers Etherscan, so the Creditcoin side needs
Blockscout explicitly — easy to forget, and the contracts sat unverified because
of it:

```sh
forge verify-contract <address> <path>:<Name> \
  --verifier blockscout \
  --verifier-url https://creditcoin-testnet.blockscout.com/api \
  --chain-id 102031
```

Proxies additionally need `--constructor-args $(cast abi-encode \
"constructor(address,bytes)" <implementation> <initCalldata>)`, both of which
are recorded in `broadcast/DeployCreditcoin.s.sol/102031/run-latest.json`.

Deployment needs `GOVERNANCE_ADDRESS`, `OPERATOR_ADDRESS`, `DEPLOYER_PRIVATE_KEY`
and, for Creditcoin, `SOURCE_VAULT_ADDRESS` and `STAKING_ACCOUNT_ADDRESS`.
`EvmV1Decoder` is linked at deploy time — see `script/DeployCreditcoin.s.sol`.
