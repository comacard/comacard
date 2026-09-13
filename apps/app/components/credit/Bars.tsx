import { cn } from "../../lib/utils";

/**
 * The bar chart under the spend record. Values are normalized against the series maximum; the 8px
 * floor keeps a zero bar visible. Decorative: the numbers a reader needs are already rendered as
 * text beside it.
 *
 * The `max > 0` guard is load-bearing, not defensive noise: an all-zero series is a **reachable**
 * state, a month in which nothing was spent, and `v / 0` would put `NaN` in a style attribute. It
 * renders a flat row at the floor, which is why an all-zero series never reaches here: `SpendChart`
 * shows a written zero state instead, because a flat row of stubs reads as broken rather than as
 * nothing.
 *
 * The green gradient is deliberate: it carries the same accent as every other figure on these
 * screens that reports money moving as intended.
 *
 * The classes go through `cn()` rather than a template string because `h-[118px]` is a default a
 * caller has to be able to beat. Tailwind emits utilities in numeric order rather than in the order
 * a class attribute lists them, so an override appended to a plain string loses silently, which is
 * a bug this repo has already paid for once.
 */
export function Bars({ values, className = "" }: { values: number[]; className?: string }) {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  return (
    <div
      data-testid="bars"
      aria-hidden="true"
      className={cn("my-3.5 flex h-[118px] items-end gap-1", className)}
    >
      {values.map((v, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length literal array, the index is the identity
          key={i}
          data-testid="bar"
          style={{ height: `${8 + (max > 0 ? v / max : 0) * 104}px` }}
          className="min-h-[6px] flex-1 rounded-t-[5px] rounded-b-[2px] [background:linear-gradient(180deg,#22c55e,var(--color-pos))] [transition:height_.55s_cubic-bezier(.16,1,.3,1)]"
        />
      ))}
    </div>
  );
}
