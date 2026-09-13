# @comacard/web

**Nothing runs here.** An empty workspace scaffold, kept so the name is reserved and Turbo has a
target if one is ever needed.

```ts
// src/index.ts, in its entirety
export const name = "@comacard/web";
```

Do not put the cardholder app here — that is `apps/app`, and it is a running Next 16 application.
Do not put the marketing site here — that is `apps/landing`.

If you find yourself adding real code to this package, the first question is whether it belongs in
one of those two instead. If it genuinely does not, pick the framework in its own issue first: this
scaffold has no opinion and inheriting one by accident is how a third frontend appears.
