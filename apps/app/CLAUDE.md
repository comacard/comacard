@AGENTS.md

# @comacard/app

The cardholder app. Next 16 (App Router, Turbopack) + React 19 + Tailwind 4 (`@theme` in
`app/globals.css`, no config file).

```bash
bun run dev        # localhost:3000
bun run test       # vitest
bun run lint       # eslint, NOT biome. See the note at the bottom.
```

## Where this code came from, and what is left of it

This app started as a **verbatim copy of the SoroSense Stellar frontend** and was converted in place.
As of the #9 sweep the conversion is done: `@sorosense/vault-client`, `lib/vault`, `lib/api`,
`lib/earn`, `lib/wallet`, `providers/VaultProvider`, `lib/wallet-real.ts` and the three `@stellar/*`
packages are all gone, along with the `/withdraw` route that was still rendering a Stellar keypad on
the path `/withdraw/x/[id]` now uses. 100 files, and the test count went 427 → 200 — not coverage
lost, but assertions about buckets, APY and an agent feed this product does not have.

Two things survive on purpose:

- **`app/page.tsx`** — the onboarding screen. Still names Blend and DeFindex in its copy. It imports
  none of the removed code; this is wording, not wiring, and Axel is handling it separately.
- **Provenance comments.** `Switch.tsx`, `Segmented.tsx` and `Bars.tsx` cite
  `docs/mockups/sorosense-mock-2.html` as the origin of their geometry. Those are honest notes about
  where a design came from, not Stellar code.

`localStorage` keys are still prefixed `soro.` (`soro.wallet`, `soro.onboarding.done`). Renaming them
signs everyone out, which is not worth doing before a demo.

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

## One backend, and the chain beside it

`lib/comacard/` is the whole client surface. `NEXT_PUBLIC_COMACARD_API_URL` points at `apps/api`,
which composes KYC, the credit line and the indexer into one answer per wallet. (`lib/api/` was the
SoroSense vault client and is gone; `NEXT_PUBLIC_API_URL` no longer does anything.)

`lib/comacard/graphql/` reads the Envio indexer directly, because the API exposes no `Attestation`
route and that row is how a screen learns collateral has finished crossing.

**Read the chain for anything the user is about to act on, the indexer only for history.** Not a
preference: the indexer has held a plausible wrong answer twice in one day and neither surfaced as an
error. `ClaimableCollateral` reads the vault's own `nativeReleasable` rather than
`RemoteWithdrawal.approvedAt`, and where the two disagree the chain wins — there is a test on that
ordering, because two of the three real withdrawals on the live indexer carry `withdrawnAt` with
`approvedAt` still null.

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

## Collateral arrives by two different carriers

`useCollateral` is the Attestcoin path (Sepolia). `useRemoteCollateral` is the Wormhole path, reading
`WormholeCollateralHub` on Creditcoin plus each far vault directly. They are summed by the contract,
not here — see the root `CLAUDE.md` for why the credit line never learned about a second chain.

**Chain ids are three different number spaces and two of the five break the pattern.** BSC is
Wormhole `4` and Fuji is `6`; Base, Arbitrum and Optimism are 10004, 10003, 10005. Extrapolating puts
Fuji at `10006`, which is Holesky — this app shipped that bug. `lib/comacard/__tests__/chains.test.ts`
pins all five in both directions against the worker's vault list.

**The native coin is not always ETH.** `NATIVE_SYMBOL` maps the chain to BNB, AVAX or ETH. The deposit
screen used to read `native ? "ETH" : "USDC"` and announced "Lock ETH — 0.072136 ETH on BSC Testnet",
which is the wrong asset on the screen that asks someone to part with it.

**Nor is the wait one number.** `crossingTime()` says "under a minute" for BSC and Fuji and "about
fifteen minutes" for the three L2s, which publish at finalized consistency and so finalize against
Ethereum. One figure for five chains is wrong by a factor of thirty on two of them.

**A withdrawal is three transactions on two chains**, and `ReleaseCollateral` is honest that it is
three. The relay approves; it never pushes funds. A screen that says "withdrawn" once the guardians
have signed is claiming the money is in someone's wallet when it is sitting in a vault waiting for a
signature they have not given.

**The maximum withdrawable is computed, not discovered.** `releasableValue()` solves
`requestRelease`'s own inequality from the other side, rounding the requirement **up** so the figure
is never a wei too generous. Letting someone find `ReleaseWouldStrandDebt` by paying gas for it is
the failure this avoids.

**`(flow)` routes redirect on desktop, except the two addressed by asset id.** `/deposit/x/[id]` and
`/withdraw/x/[id]` render at every width; everything else in that group has a drawer to redirect to.
`/deposit/x/[id]` used to be matched by the `/deposit/` rule and sent to `?panel=deposit` — the drawer
the link was clicked in — so desktop cross-chain deposits went in a circle.

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

**A receipt is not a success.** `lib/comacard/tx.ts` is the one definition: it returns nothing, so
there is no value a caller can forget to check, and it takes an optional read-back of the state the
transaction was meant to change. Four screens reported reverts as green checks before it existed —
including `useCreditLine.txStatus`, which read `receipt.isSuccess`, wagmi's "the query resolved"
rather than "the transaction succeeded".

**A failure before the wallet is asked is still a failure.** `switchChainAsync`, a fee read, the
receipt check — none of them are `useWriteContract`'s `error`, and every cross-chain screen used to
catch them into a comment. A button that goes busy, comes back, and says nothing is
indistinguishable from a click that did not register.

**`useWallet()` is the only answer to who is connected.** Not `useAccount()`, and certainly not
`config.connectors[0]` — that is the first *registered* connector, not the connected one. It returns
no accounts, the address comes out `undefined`, and the first contract read throws
`Address "undefined" is invalid` before the wallet is ever opened.

**An unread figure is a dash, never a zero.** `0 tCTC` is a claim about someone's money. `SpentTotal`
withholds its row when the indexer read failed, `StatStrip` prints `—`, and Spend disables with a
spinner rather than a flat grey label while the limit is still being read — the Creditcoin RPC takes
about four seconds a call, and for that whole window `available` is `undefined`.

**`repay()` takes no amount.** `useCreditLine.repay` re-reads `accountOf` one call before sending and
uses that verbatim, because the contract refuses an overpayment rather than refunding it and any
cached figure goes stale exactly when someone has just drawn. The parameter is gone from the
signature so no call site can believe its own number was used.

## Lint

`bun run lint` here is **ESLint**, inherited from the SoroSense port. The repo root uses **Biome**,
and the pre-commit hook runs `biome check --staged --write`.

That hook is fine in normal use: it only looks at staged files. It becomes a wall when this app is
staged in bulk, which is exactly what the port did: one commit staging the whole tree had Biome
rewrite 171 files and still fail with ~187 errors, because SoroSense was written to a different
style. Commits covering the port therefore need `--no-verify`, and clearing that is a real decision
someone has to make: exclude `apps/app` from Biome, or convert the app to it.
