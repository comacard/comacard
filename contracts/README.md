# Contracts

The onchain half of Comacard: a revolving credit line whose limit comes from a
borrower's proven track record rather than from the balance in their wallet.

Collateral is locked wherever the borrower already holds it and never moves.
Attestcoin proves those locks — and the borrower's history on mainnet — across
to Creditcoin, where the credit line reads them, sizes a limit, and lends
against it. Repay on time and the limit grows; let a debt lapse and anyone can
close it as a default, which costs the borrower that limit.

Attestcoin reaches Ethereum and Sepolia. Every other chain arrives by Wormhole
instead, through a vault deployed there and a hub on Creditcoin that reads the
signed message.

## Deployed

| Contract | Chain | Address |
| --- | --- | --- |
| `SourceVault` | Ethereum Sepolia | [`0x911290c37E9558C704870f4C44CBdEA1B2B33303`](https://sepolia.etherscan.io/address/0x911290c37E9558C704870f4C44CBdEA1B2B33303) |
| `ASCCreditLine` | Creditcoin CC3 (`102031`) | [`0x18052272cC69113DE2b45d2BDB4E1fB287F4E906`](https://creditcoin-testnet.blockscout.com/address/0x18052272cC69113DE2b45d2BDB4E1fB287F4E906) |
| `CtcStakingAdapter` | Creditcoin CC3 (`102031`) | [`0xA94218Dbdb142A10e32eF7b494105D27F47f7045`](https://creditcoin-testnet.blockscout.com/address/0xA94218Dbdb142A10e32eF7b494105D27F47f7045) |
| `WormholeCollateralHub` | Creditcoin CC3 (`102031`) | [`0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f`](https://creditcoin-testnet.blockscout.com/address/0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f) |
| `WormholeVault` | Base Sepolia (`84532`) | [`0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf`](https://sepolia.basescan.org/address/0x7439dff6270C2B52B00B7Fc5CA94c56d5b166Daf) |
| `WormholeVault` | Arbitrum Sepolia (`421614`) | [`0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30`](https://sepolia.arbiscan.io/address/0x029ae4fffE7DBD8dF7450E12d25a840A818f7F30) |
| `WormholeVault` | Optimism Sepolia (`11155420`) | [`0xCaBFa324576c655D0276647A7f0aF5e779123e0B`](https://sepolia-optimism.etherscan.io/address/0xCaBFa324576c655D0276647A7f0aF5e779123e0B) |
| `WormholeVault` | BSC Testnet (`97`) | [`0x9d8B6852705dD7585B3907244d603547a4eA32d6`](https://testnet.bscscan.com/address/0x9d8B6852705dD7585B3907244d603547a4eA32d6) |
| `WormholeVault` | Avalanche Fuji (`43113`) | [`0x7D68B54a6eDd92F9e6f17E75dbE4d9838cD88a1b`](https://testnet.snowtrace.io/address/0x7D68B54a6eDd92F9e6f17E75dbE4d9838cD88a1b) |

The Creditcoin and Sepolia contracts are UUPS proxies. The vaults are not: one
is deployed per chain, its job is small, and a proxy on every chain is machinery
to maintain in exchange for flexibility a vault this simple does not need. Sepolia is verified on Etherscan; the implementation
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

### Collateral from other chains

Attestcoin proves transactions from Ethereum and Sepolia. For everywhere else
there is one carrier available on Creditcoin — the Wormhole Core Contract, with
no token bridge and no relayer attached — so a `WormholeVault` holds the deposit
on its own chain and publishes a message saying so. `WormholeCollateralHub`
reads that message and credits the collateral. The asset itself never crosses,
which is the same promise the Attestcoin path makes.

| Chain | Wormhole id | Accepted | Priced at |
| --- | --- | --- | --- |
| Base Sepolia | `10004` | ETH, [USDC](https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e) | 1,000 / 1 CTC |
| Arbitrum Sepolia | `10003` | ETH, [USDC](https://sepolia.arbiscan.io/address/0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d) | 1,000 / 1 CTC |
| Optimism Sepolia | `10005` | ETH | 1,000 CTC |
| BSC Testnet | `4` | BNB | 600 CTC |
| Avalanche Fuji | `6` | AVAX | 25 CTC |

Adding a chain is a deploy and two calls: `setVaultPeer` and `listAsset`.

All five have been exercised with a real deposit. One account's collateral
currently sums to **57.5 CTC across five chains** — 0.01 ETH on Base, 0.005 on
Arbitrum, 0.05 BNB on BSC, 0.5 AVAX on Fuji — each valued at its own decimals
and its own price, on top of what Attestcoin proves from Sepolia.

Finality is not the same everywhere, and it shows. The two L1s signed in under a
minute; the L2s take fifteen to twenty, because they finalize against Ethereum.

Three checks decide whether a message is ours, and they are what the test suite
is about:

- **the peer registry**, because anyone can deploy their own vault, lock
  nothing, and publish a message the guardians will sign quite happily
- **the VAA hash**, because Wormhole says a message is authentic and never says
  it is fresh
- **the decimals** the vault read off the token against the decimals we listed,
  since disagreeing on those misprices a stablecoin by twelve orders of magnitude

Assets are keyed by chain *and* address: USDC on Base and USDC on Arbitrum are
different tokens in different vaults, and a depeg on one says nothing about the
other.

The vaults publish at **finalized** consistency, so the guardians sign roughly
fifteen minutes after the deposit — an L2 finalizes against Ethereum. That wait
is the price of not crediting collateral a reorg could take back. Delivery is
permissionless: `bun run relay 10004 <sequence>` from `apps/worker` fetches the
signed message and submits it, but so can the borrower, because the hub trusts
the signatures rather than the sender.

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
  wormhole/     WormholeVault.sol     collateral custody on any other chain
                WormholeCollateralHub.sol  reads the signed deposits
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
