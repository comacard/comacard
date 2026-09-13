// Vendored from beUI (https://beui.dev/components/blocks/card-folder), MIT.
// Kept close to upstream so it can be re-synced; Comacard styling lives in
// components/card/, not here.
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Merge class lists so the caller's class wins, rather than whichever Tailwind happened to emit
 * last.
 *
 * **This is not a formatting nicety.** Tailwind emits utilities in its own order, not in the order
 * they appear in a `class` attribute. Measured in this app's own built stylesheet: `.mt-0` is at
 * line 744 and `.mt-4` at 772, so `class="mt-4 mt-0"` resolves to `mt-4` and a caller passing
 * `mt-0` to override a component's `mt-4` loses silently. `CollateralList` works around exactly
 * this with a default parameter (`className = "mt-4"`) rather than concatenation.
 *
 * **`extendTailwindMerge` is doing real work here, not ceremony.** Plain `twMerge` resolves
 * `bg-card bg-white` and `text-[13px] text-[14px]` correctly, because it treats unknown values in
 * those groups as arbitrary. It does NOT resolve `rounded-card rounded-none`: both survive, and the
 * one Tailwind emits later wins, which is the bug this function exists to remove. The radius scale
 * in `@theme` has to be declared for the merge to know they conflict.
 *
 * Only `--radius-*` needs declaring. Colours, spacing and type all resolve without help, which is
 * why this list is short rather than a copy of the theme.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // `--radius-card`, `--radius-sheet`, `--radius-field` in app/globals.css.
      rounded: [{ rounded: ["card", "sheet", "field"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
