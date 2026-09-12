@AGENTS.md

# @comacard/app

The cardholder app. Next 16 (App Router, Turbopack) + React 19 + Tailwind 4 (`@theme` in
`app/globals.css`, no config file).

```bash
bun run dev        # localhost:3000
bun run test       # vitest
bun run lint       # eslint, NOT biome. See the note at the bottom.
```

## Where this code came from, and why that still shows

This app started as a **verbatim copy of the SoroSense Stellar frontend** and is being converted in
place. That history explains almost every oddity you will hit:

- `@sorosense/vault-client` is still imported in ~60 files, and the whole `lib/vault/` seam is still
  Stellar-shaped.
- `localStorage` keys are still prefixed `soro.` (`soro.wallet`, `soro.onboarding.done`).
- `/earn` and `/deposit` are **untouched SoroSense screens**. `/deposit` still lists USDC, EURC and
  CETES labelled "Stellar", and the Deposit button on Home leads there.
- `lib/wallet-real.ts` is the old Stellar Wallets Kit implementation, unwired since the move to
  Reown. Dead, kept for reference.

Screens that have been converted (`/`, `/home`, `/card`, `/transactions`) carry no Stellar wording.
Do not assume the rest have.

## The wallet layer

**Reown AppKit + wagmi + viem.** `@reown/appkit-adapter-ethers` was removed; do not add it back.
Both adapters register the `eip155` namespace and installing the pair breaks connection state
silently.

`lib/wallet.ts` is the seam: five functions (`connect`, `getAddress`, `getWalletId`,
`signTransaction`, `disconnect`) that `WalletProvider` and every screen already consume. Swapping
ethers for wagmi touched no component because of it. New code can use wagmi hooks directly.

**Everything from `@reown/*` and `wagmi/actions` is imported dynamically**, and that is load-bearing,
not style. `WalletProvider` is a client component, so Next evaluates it on the server too, and a
static import drags the connector stack into the SSR graph.

**`WalletProvider` is the single answer to "who is connected".** `AuthGate` gates on it and every
screen reads it. Reading `useAccount()` from wagmi instead makes one screen disagree with the rest of
the app about whether anyone is signed in.

**Connect happens on Sepolia, then switches to Creditcoin.** AppKit's adapter fires
`wallet_switchEthereumChain` during connect and never offers to ADD an unknown chain, so leading with
Creditcoin fails outright with "Connection declined" for any wallet that has not added CC3. Sepolia
ships in every wallet; `selectCreditcoin()` moves the session over afterwards, through the one code
path that does fall back to `wallet_addEthereumChain`. Each network also needs
`rpcUrls.chainDefault` as well as `rpcUrls.default`: add-chain reads the former and sends an empty
array without it.

**`@x402/core`, `@x402/evm` and `@x402/svm` are dependencies precisely because nothing imports
them.** `@wagmi/connectors` reaches `@coinbase/cdp-sdk` through its Base Account connector, that SDK
imports all three, and an unresolved one fails the whole graph: every route returns 500 on a code
path this app cannot execute. Stubbing them out instead removed Coinbase Wallet from the modal.

## Two backends, two clients

| | Env var | Serves |
| --- | --- | --- |
| `lib/comacard/` | `NEXT_PUBLIC_COMACARD_API_URL` | the credit line: KYC, card, limit |
| `lib/api/` | `NEXT_PUBLIC_API_URL` | the SoroSense vault backend, currently unset |

Pointing one at the other 404s every read. `lib/comacard/graphql/` reads the Envio indexer directly,
because the API exposes no `Attestation` route and that row is how a screen learns collateral has
finished crossing.

## Prices

`lib/comacard/oracle.ts` reads them from contracts, not a price API: Chainlink ETH/USD on Sepolia,
and the Uniswap V2 CTC/WETH pool's reserve ratio on Ethereum mainnet for ETH/CTC. CTC/USD falls out
of the two. That pool holds about 1.8 WETH, which is cheap to move. It is an honest live number for
a testnet demo and **not** collateral-grade pricing. Say it that way if anyone asks.

## Collateral is multi-asset

`useCollateral` reads the token list from `listedTokens()` on chain, never a hardcoded list, because
listing a token is a governance call. `tokenConfig.price` is per **whole** token and each token
carries its own `decimals`: treating 6-decimal tUSDC as 18 values it at a trillionth of its worth.
Total value comes from `collateralValueOf()`, not from re-summing the parts here.

`lockToken` is **two transactions**: an ERC20 approval whose receipt must be awaited, then the lock.
The vault credits what actually arrived, so never assume the requested amount is what got locked.

## KYC

Didit's hosted flow is embedded in an iframe (`components/card/KycSheet.tsx`), not opened in a new
tab. It sends no `X-Frame-Options` and no `frame-ancestors`, so it frames cleanly.

**`allow="camera; microphone"` on that iframe is the whole thing.** Framing policy and permission
policy are separate gates: without it the page still renders and then dies at the face check with
`NotAllowedError`, which reads as a broken product. Both were measured against a live session.

The verdict never comes back through the iframe. Didit reports it by webhook to `apps/kyc`, so the
sheet polls our own backend and takes the screen back with a success state when it clears. Brave's
shields refuse the frame on a localhost page, and a cross-origin frame cannot be inspected, so the
"open in a new tab" escape is always visible rather than revealed after a failure nothing can detect.

## Things that bite

**`.stagger > *` animates direct children to `opacity: 1`**, and an animation beats a utility class.
A `Toast` placed inside a `.stagger` wrapper is permanently visible with an empty message.

**Read the clock after mount, never during render.** A relative time computed while rendering bakes
the server's clock into the HTML and makes the render impure; the lint rule catches it.

**`torph` needs `matchMedia` and `getAnimations`**, neither of which jsdom has. `vitest.setup.ts`
shims both and reports reduced motion, so morphing labels assert on final text instead of racing a
frame.

**`userEvent.setup()` installs its own clipboard stub**, so a clipboard spy has to be planted after
it, not before.

**Vitest does not read tsconfig paths.** The `@/` alias is declared again in `vitest.config.mts`; the
vendored beUI card-folder uses it.

## Lint

`bun run lint` here is **ESLint**, inherited from the SoroSense port. The repo root uses **Biome**,
and the pre-commit hook runs `biome check --staged --write`.

That hook is fine in normal use: it only looks at staged files. It becomes a wall when this app is
staged in bulk, which is exactly what the port did: one commit staging the whole tree had Biome
rewrite 171 files and still fail with ~187 errors, because SoroSense was written to a different
style. Commits covering the port therefore need `--no-verify`, and clearing that is a real decision
someone has to make: exclude `apps/app` from Biome, or convert the app to it.
