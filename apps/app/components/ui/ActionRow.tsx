import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The row of actions that sits directly under the headline figure.
 *
 * Two things about it are borrowed and one is not. The shape is: one filled pill leading, the rest
 * outlined, sized to their labels rather than stretched — the eye is already on the number, so the
 * actions meet it there instead of being found further down. What is not borrowed is the count. The
 * reference has four and an overflow; this has two, or three when a balance is open, because those
 * are all the things a cardholder can do here. An overflow menu holding nothing is furniture.
 *
 * It scrolls rather than wraps. Three pills fit a 390px screen comfortably and a fourth would not,
 * and a row that wraps to two lines stops reading as one group of choices. `-mx-5 px-5` lets the
 * overflow run to the screen edge instead of clipping inside the page gutter.
 *
 * Pills are 44px rather than the 56px of a full-width `Button`. That is the floor for a touch
 * target, not a comfortable size for one, and it is the trade this layout makes: the primary action
 * gives up height to sit above the card rather than below it.
 */
export function ActionRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function ActionPill({
  primary = false,
  className = "",
  children,
  ...props
}: { primary?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-transform active:scale-[.985] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100 ${
        primary
          ? "text-[#f8f8f8] [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]"
          : "border border-line bg-white text-ink-2 [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_8px_18px_-10px_rgba(0,0,0,.18)]"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
