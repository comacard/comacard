# Contracts

Two sides, because Attestcoin only reads one direction (source chain → Creditcoin).

| Chain | Contract | Role |
| --- | --- | --- |
| Sepolia (`chainKey 1`) | `SourceVault` | Holds collateral, emits the events Creditcoin proves |
| Ethereum Mainnet (`chainKey 3`) | — | Read-only: existing Aave/Lido/ERC20 events become credit history |
| Creditcoin CC3 Testnet | `ASCCreditLine` | Verifies proofs via `ASCBase`, derives the limit, tracks draws |

`ASCBase` (`@gluwa/asc-contracts`) already handles proof verification and replay
protection, so `ASCCreditLine` only implements `_processAndEmitEvent`.

```sh
forge build
forge test
```
