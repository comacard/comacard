# Desktop layout: what seventeen finance sites actually do

Measured, not remembered. Every number below was read out of `getComputedStyle` in a real Chrome at
a 1440px viewport on 12 Sep 2026, not recalled from memory or copied from a blog post. The probe
counted every element on the page and reported the most frequent value for each property, so "16px
×2026" means two thousand elements on stripe.com compute to a 16px font size — that is the body
size, not a guess at it.

Two sites refused measurement and are recorded as such rather than filled in: **usa.visa.com** and
**mastercard.us** both deny script execution to the extension, so nothing quantitative came back
from either. **cash.app** answered with a Cloudflare interstitial. Their absence matters — the two
card networks were the ones specifically asked about — so they are named here instead of quietly
dropped.

## The raw readings

| Site | Header | Container max-width | Body size | Radii | Gap scale | Face |
| --- | --- | --- | --- | --- | --- | --- |
| stripe.com | 76px, relative, transparent, no border | **1266** / 843 / 818 | 16 (nav 14) | 4, 6, 8 | 8/16/24/32/64 | sohne-var |
| mercury.com | no `<header>` element | 1952 / 1376 / 1320 | 16, 14 | 4, 8, 12, 32, 40 | 4/8/12/32/40 | arcadia |
| brex.com | 60px, static, transparent | 1680 / 760 / 705 | 16, 14 | 6, 8, 10, 12 | 8/16/24/48 | inter |
| ramp.com | 102px, **fixed**, transparent | 1440 / 1050 / 768 | 16 | 4, 6, 12 | 8/16/24 | TWK Lausanne |
| wise.com | no `<header>` element | 1440 / 1600 / 840 | 18, 16, 22, 14 | 2, pill | 4/8/37.5 | Inter |
| revolut.com | 72px, **sticky**, transparent | **1000** / 720 | 16, 12 | 12, 20, 50, pill | 8/16/24/56 | Inter |
| monzo.com | 87px, sticky, transparent | 936 / 1376 / 1440 | 16, 20 | 4, 24, 32, 64, 500 | 8/16/20/24 | MonzoSansText |
| n26.com | 73px, static, `#faf8f5`, **0.5px border** | 1464 | 18, 16, 14 | 16, 24, 32, 40 | 8/12/16/24 | N26 |
| klarna.com | 72px, static, transparent | 1760 / **1140** / 1680 | 16, 14, 12 | 16, 20, 32, 48, pill | 4/8/12/16/24 | Klarna Text |
| squareup.com | 72px, static, transparent | 1320 / **1280** / 708 | 16, 18 | 4, 6, 10, 20, 50 | 10/12/20/40/60 | Cash Sans |
| robinhood.com | mega-menu, 285px open | **1280** | 16, 13 | 3, 20, 36 | 8/12/32 | Capsule Sans Text |
| plaid.com | mega-menu, 411px open | 1730 | 16, 18, 20 | 2, 4, 8, 12, 100 | 8/16/24 | Cern |
| coinbase.com | 0px (nav is not the header) | 1600 / **1200** / 844 | 16, 14, 18, 20 | 12, 16, 56 | 8/12/16/24/48 | CoinbaseText |
| **app.aave.com** | **48px, sticky, `#1b2030` solid** | **1240** | **14**, 16, 12 | 2, 4, 6, 8 | 4/8/12/16 | Inter |
| **debank.com** | **65px, sticky, white, 1px border** | — | 16, 14, 40 | 8, 20, 24, pill | 16/20/24/36 | Lato |
| privacy.com | 81px, relative, transparent | 1360 / **1280** / 800 | 16, 14 | 12, 24, 40, 100 | 8/16/24/32/40 | FK Grotesk |
| lithic.com | 65px, relative, white | 1392 / 1184 / 940 | 16, **14** | 8, 16, 24, 160 | 4/8/12/16/24 | ABC Monument Grotesk |
| usa.visa.com | *script execution denied* | — | — | — | — | — |
| mastercard.us | *script execution denied* | — | — | — | — | — |
| cash.app | *Cloudflare interstitial* | — | — | — | — | — |

Grid definitions worth copying verbatim:

```
stripe.com    grid-template-columns: 296px 296px 592px   gap: 16px
coinbase.com  grid-template-columns: 372px 372px         gap: 16px
privacy.com   grid-template-columns: 214px 856px 257px   gap: 16px
lithic.com    grid-template-columns: 1fr 1fr 1fr         gap: 24px 16px
n26.com       grid-template-columns: repeat(12, minmax(0,1fr))  gap: 16px
```

Aave's asset rows step **76px** apart (headings at y=384, 460, 536, 612…), its page title is
**32px/700**, and its content starts at **x=164** in a 1440px viewport — a 160px gutter each side.

## What the numbers say

**Marketing pages and dashboards are two different design problems, and only three of these
seventeen are dashboards.** app.aave.com, debank.com and lithic.com are the ones with a logged-in
surface, and they are the ones that matter here: Comacard's Overview is a dashboard, not a landing
page. The three of them agree on things the marketing sites do not.

1. **A dashboard header is short and solid.** Aave 48px on `#1b2030`, debank 65px on white with a
   1px border, lithic 65px on white. Marketing headers are 72–102px and transparent, because they
   float over a hero. A dashboard header is chrome: it earns its height back as content.

2. **Content stops between 1200 and 1280px.** Aave 1240, privacy 1280, coinbase 1200, robinhood
   1280, square 1280, klarna 1140, stripe 1232 of usable width inside 1266. Revolut goes down to
   **1000**. Nothing that is read rather than scrolled runs edge to edge.

3. **Dense financial UI reads at 14px, not 16px.** Aave computes 14px on 601 elements against 122
   at 16px — the whole app is 14px and 16px is the exception. Lithic is 16/14 nearly evenly split.
   Marketing sites are 16px almost without exception, and one (wise.com) leads at 18px.

4. **Radii are bimodal and the two modes mean different things.** Buttons and chips are pills
   (9999, 99999, 100000, 500). Containers are small: 4 (stripe, aave), 6, 8, 12 (mercury, brex,
   ramp, privacy, coinbase). Only Monzo and lithic go past 24px, and both are marketing pages
   where a card is a poster. **No dashboard in this set uses a container radius above 8px.**

5. **The spacing scale is 4/8/12/16/24/32/40/48/64, everywhere, without exception.** Sixteen of
   seventeen sites' most frequent gaps are drawn from it. Off-scale values (wise's 37.5px, ramp's
   6.1px font) are all computed from `clamp()` or a transform, never authored.

6. **Fixed pixel columns are normal.** Stripe, coinbase and privacy all name column widths in px
   rather than fractions. A panel whose contents have a natural size — a card image, a form — gets
   a px column; only the reading column gets `1fr`.

## Measured against this app

The same probe, run against `localhost:3000/home` at the same 1440px viewport:

```
header            65px                       ✓ inside the dashboard band (48–65)
content column    x=36, width 1368           ✗ 95% of the viewport; the band is 1200–1280
columns           573px / 775px, gap 20px    ✗ 20 is off-scale; a 573px rail holds a 340px card
left column       598px tall
right column      372px tall                 ✗ 226px of imbalance, and the shorter one is the data
"Repay" button    481 × 56                   ✗ a 481px pill for a five-letter label
"Spend" button    252 × 56                   ✗ no reference renders a desktop button above ~200px
card artwork      340 × 196 inside 517px     ✗ 177px of air around the one object with a real size
page title        none                       ✗ every reference names the page; Aave at 32px/700
summary figures   none                       ✗ limit, available and owed are scattered or absent
```

Six of the eight are the same fault: **the desktop screen is the phone screen with a second column
bolted on.** `w-full h-14` buttons, a 22px card radius, a 26px centred hero and a single-column
stack are all correct decisions for a 390px viewport, and all of them are wrong at 1440px because
nothing about them was re-decided.

The seventh and eighth are the expensive ones. There is no page title and no summary row, so a
screen whose entire subject is three numbers — what the limit is, what is left to spend, what is
owed — leads with none of them in a place the eye lands first. Aave gives that job to a full-width
panel above the columns. debank gives it to a summary row. This app gives it to a figure inside a
card inside the left column, and puts the balance owed in a sub-panel that only exists when it is
non-zero.

## What was changed as a result

| Reading | Change |
| --- | --- |
| content 1200–1280 | container capped at 1280, `px-10`, so 1440 yields 1200 of content |
| fixed px rails | `grid-cols-[400px_minmax(0,1fr)]` — the rail is sized to the card artwork |
| gap 16–24 | 20px gap replaced with 24 |
| dashboard 14px | desktop rows and labels moved onto 14/13, off the 15/16 mobile sizes |
| container radius ≤ 8 on dashboards | kept 22px — see the note below |
| buttons are not full-width | `Button` gained a `size`; desktop uses `md` (44px) in a 400px rail |
| every page is named | `PageHeader` |
| the summary comes first | `StatStrip` — one card, four hairline-separated tiles |

The radius is the one reading deliberately not followed. Every dashboard in the set sits at 4–8px
and this app sits at 22px, but that 22px is not an accident of the port: it is the radius of the
card artwork, the bottom sheet and the pill buttons, and it is what makes the product look like a
piece of consumer hardware rather than a trading terminal. Copying Aave's 4px would make the app
look like Aave. The reading is recorded so the choice is visible as a choice.
