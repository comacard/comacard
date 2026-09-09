# Contracts

Pure Foundry — no Node toolchain, no `package.json`.

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

Deployment needs `GOVERNANCE_ADDRESS`, `OPERATOR_ADDRESS`, `DEPLOYER_PRIVATE_KEY`
and, for Creditcoin, `SOURCE_VAULT_ADDRESS` and `STAKING_ACCOUNT_ADDRESS`.
`EvmV1Decoder` is linked at deploy time — see `script/DeployCreditcoin.s.sol`.
