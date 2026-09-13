# @sorosense/vault-client

**Dead.** Nothing in this repo imports it, and nothing should.

It is the vault seam from **SoroSense**, the Stellar product `apps/app` was ported from. It has two
implementations behind one interface: `MockVaultClient` in memory, and `RealVaultClient` — which
talks to **Soroban**, with a Stellar network passphrase, Blend pools and Freighter.

So it was never a placeholder waiting for our contracts. **There is no configuration of it that
talks to Creditcoin.** Setting its environment variables would point it at Stellar.

## Why it is still here

Removing the package outright is a separate change from removing its *use*, and the use is what
mattered. `apps/app` imported it in about sixty files — including, until recently, a live `/withdraw`
route rendering a Stellar keypad on the path the real cross-chain withdrawal now uses.

All of that is gone (issue #9): the dependency is out of `apps/app/package.json` along with
`lib/vault`, `lib/api`, `providers/VaultProvider` and the three `@stellar/*` packages that only
existed to satisfy `lib/wallet-real.ts`.

## If you are reading this to decide something

Delete the directory. Nothing references it, `bun install` does not need it, and a package named
after another product is a question we would have to answer rather than a fact in our favour — the
same argument that removed the Stellar dependencies.

It is left standing only because deleting a workspace member is a slightly noisier change than
deleting an import, and it was not worth bundling into the same commit. There is no technical reason.
