# Vendored Attestcoin contracts

Source: the `@gluwa/asc-contracts` npm package, v0.2.1.

Vendored rather than installed because Gluwa publishes these contracts to npm
only — there is no public git repository for `forge install` to point at, and
this project keeps `contracts/` on pure Foundry with no Node toolchain.

Only `readability/ASCBase.sol` and `common/EvmV1Decoder.sol` are used directly;
the rest of the tree is kept so their imports resolve unchanged.

Do not edit. To update, replace the tree from a newer package release.
