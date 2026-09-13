# @comacard/kyc

Bun server on Railway, wrapping Didit's hosted identity flow. Owned by Kiel (`yeheskieltame`).

```bash
bun run dev
bun run test      # test/db.test.ts holds the schema and the query
```

Live: `https://kyc-production-e05a.up.railway.app`

## Three routes and one table

```
POST /kyc/session         start a session, hand back Didit's URL
POST /kyc/webhook         Didit reports its decision here, signed
GET  /kyc/status/:wallet  what apps/api reads
```

Everything lands in one SQLite table, `sessions`, keyed by `session_id` with the wallet as a column.
`db.ts` holds the schema and the queries so a test can exercise them without importing the server.

## The verdict never comes back through the browser

Didit answers by **webhook**, never to the tab that opened the flow. So:

- the app's KYC sheet polls our own backend rather than waiting on a redirect
- `KYC_CALLBACK_URL` only decides where the user's browser lands afterwards; it carries no decision
  and nothing should be inferred from its query string
- a session can be `Approved` before the user's browser has finished returning

`apps/app/app/kyc/return/page.tsx` exists because of that callback and decides nothing from what it
is given. Renaming the route without repointing `KYC_CALLBACK_URL` lands every verified user on a
404, quietly, because the webhook still succeeded.

## An approval outranks a session that has not concluded

The status read takes one row per wallet, and the ordering is the whole of it:

```sql
select session_id, status, decision, updated_at from sessions
where wallet = ? order by (status = 'Approved') desc, updated_at desc limit 1
```

It used to be `order by updated_at desc` alone, and that is a real bug rather than a nicety.
`kycStart` inserts a fresh `Not Started` row with `updated_at = now`, so **starting a second session
hid an existing approval** and the wallet read back unverified — losing its card, its PAN and its
holder name until the new flow finished.

Any user reproduces it by tapping "Verify identity" twice, which is the obvious thing to do when a
screen looks stuck. Nothing was ever destroyed — the insert is `on conflict (session_id)` and a new
session has a new id — but the read is what people see.

The `updated_at` half matters beyond the flag: **`apps/api` dates the card from it**, so every new
session was quietly moving that card's expiry.

## The name is OCR'd, never typed

`nameFromDecision` pulls the cardholder name out of Didit's decision payload, off the identity
document. Nobody types it, because a typed name is not the name that was verified. It reaches the app
as `card.holder`.

The status read parses that payload in a `try`/`catch` and falls back to `null`: one malformed row
must not take down the read the card screen depends on.

## Framed, not popped

The app embeds Didit in an iframe rather than opening a tab. Didit sends no `X-Frame-Options` and no
`frame-ancestors`, so it frames cleanly — but **`allow="camera; microphone"` on that iframe is the
whole thing**. Framing policy and permission policy are separate gates: without it the page renders
and then dies at the face check with `NotAllowedError`, which reads as a broken product.

Brave's shields refuse the frame on a localhost page, and a cross-origin frame cannot be inspected,
so the "open in a new tab" escape is always visible rather than revealed after a failure nothing can
detect.
