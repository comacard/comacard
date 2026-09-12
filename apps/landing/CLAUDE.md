# @comacard/landing

Next.js 16 (App Router, Turbopack) + React 18 + Tailwind 3. Marketing site for
Comacard.

```bash
bun run dev        # localhost:3000
bun run build
bun run typecheck
```

Next 16 still accepts React 18 as a peer, which is why this app is on 18 while
the rest of the ecosystem has moved. Do not bump React without checking
`useInView` in `src/App.tsx`: React 19 changes what `useRef<T>(null)` returns and
that signature breaks first.

## Shape of the page

`src/app/page.tsx` is a `"use client"` shell that renders `src/App.tsx`. Almost
everything lives in that one file; only the newer sections are split out under
`src/components/`.

The page opens on a **scroll-locked hero**. There is no document scroll until an
intro video has played: a wheel/touch state machine runs `idle → playing → done`,
and `Content` is not mounted at all until then (`{unlocked && <Content />}`).

**This is the thing that will waste your time.** Every section below the hero is
absent from the DOM and from the server-rendered HTML until the intro finishes.
Do not conclude a section is broken because `curl` cannot find it. To reach it in
a browser, scroll once on the hero and wait about five seconds.

Order once unlocked:

```
ChatDemoSection    typed transcript, buying a coffee
SpendSection       copy top-left, product shot bleeding off the right
ReachSection       full-bleed looping ring
FeaturesSection    four columns, hairline rule, icon card each
InsightsSection    three stat cards over video
QuoteCarousel      auto-advancing slider
ClosingSection
Footer
```

## Copy

Plain, second person, concrete. Say what happens to the reader's money and stop.
Two rules that are not negotiable:

**No em dashes.** Use a full stop when it is two sentences, a comma for a pause,
a colon when the second half explains the first. This started here and now applies
to anything written for this project, comments included.

**No technical talk in the marketing copy.** Contracts, proofs, attestation and
test counts belong in the README, not on this page. A visitor cares what happens
to their money, not how it is proved.

**The testimonials are placeholders and must stay legible as such.** `QUOTES` in
`QuoteCarousel.tsx` uses the standard stand-in names (Doe, Roe, Major) and the
standard fictional companies (Acme, Contoso, Initech). That is what keeps the
section a mock rather than a claim. If a real quote goes in, the real name and
company go in with it. Do not leave a real-sounding name on an invented quote.

Marketing copy is free to be warm, but a number on this page should be one a
reader could go and check.

**The "Get Coma Card" buttons go nowhere.** Both are plain `<button>` elements
with no handler and no href. The cardholder app lives in `apps/app`; the handoff
needs nothing more than a link, and until it exists the page's only call to
action is inert.

## Things that will bite you

**Assets are remote and hardcoded.** Hero imagery comes from a Higgs CDN and the
stat cards pull three CloudFront MP4s. There is no local fallback: offline, or
the day those URLs move, those sections render empty. Everything under `public/`
is ours and safe.

**Video needs `muted` set through a ref**, not only as a JSX prop. React does not
reliably reflect it as a DOM attribute, and an unmuted video is blocked from
autoplaying. Both `ReachSection` and `InsightsSection` do this.

**The ring video ships in three encodings.** The source is HEVC, which Firefox
will not decode and Chrome only will on some platforms, so a VP9 WebM and an
H.264 MP4 follow it. Browsers take the first source they can read, so the order
is smallest-first. Add a source, keep the order.

**File extensions must match the bytes.** Next sets `Content-Type` from the
extension. Two icons arrived as WebP named `.avif` and were renamed; check with
`file` before adding an asset, not by trusting the name.

**Biome lints this workspace.** `bun run lint` runs from the repo root and it is
strict: no `any`, no unused anything, `type` required on every button, a11y rules
on. `noUnknownAtRules` is switched off for this app's CSS only, because Tailwind
3 directives are not at-rules Biome knows.

**There is no local webfont.** `.font-helvetica-neue` is a system stack only.
An earlier `@font-face` pointed at a `/fonts/` file that was never in the repo
and 404'd on every load; it was removed and nothing about the rendering changed.

**Global `* { font-family: Geist }` beats Tailwind font classes** on child
elements. That is why `.font-helvetica-neue` in `index.css` uses a descendant
selector rather than living in `tailwind.config.js`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
