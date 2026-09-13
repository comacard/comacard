# @comacard/tsconfig

Shared TypeScript configuration. No source, no tests, no build — every other workspace extends from
here so compiler settings cannot drift between them.

```json
{ "extends": "@comacard/tsconfig/base.json" }
```

## `noUncheckedIndexedAccess` is on, and it is the setting you will notice

Every in-range array access types as `T | undefined`. That is deliberate: this codebase decodes
untrusted payloads and ABI-decoded words by position, and an out-of-range read returning `undefined`
instead of crashing is exactly the failure this project keeps producing in other forms.

It also means **`noNonNullAssertion` cannot be enforced as a lint rule at the same time** — `!` is
the escape hatch this setting leaves you, so banning it while requiring it is incoherent. Biome has
the style rule off repo-wide for that reason; the compiler setting stays.

Prefer narrowing the compiler can see over `!` where it is cheap. Three chart tooltips in `apps/app`
were rewritten that way rather than suppressed.

## Changing anything here changes every package

There is no per-package override worth adding without checking `bun run typecheck` across the
workspace first. Turbo will do it in one pass.
