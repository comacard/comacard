import type { ButtonHTMLAttributes } from "react";

type Variant = "ink" | "glass";
/**
 * `lg` is the phone button: full-bleed, 56px, thumb-sized. `md` is the desktop one.
 *
 * Not a preference. Measured at 1440px across seventeen finance sites, no desktop control renders
 * anywhere near the width this app was giving them — Repay came out 481×56 and Spend 252×56, for
 * labels of five letters. A pill that wide stops reading as a button and starts reading as a banner
 * you cannot click. `lg` stays the default so every existing call site keeps the size it had.
 */
type Size = "md" | "lg";

const base =
  "flex items-center justify-center gap-2 rounded-full font-semibold transition-transform active:scale-[.985] disabled:pointer-events-none disabled:opacity-40 disabled:active:scale-100";
const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-[14px]",
  lg: "h-14 text-base",
};
const variants: Record<Variant, string> = {
  ink: "text-[#f8f8f8] [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]",
  glass:
    "bg-white text-ink-2 border border-line [box-shadow:inset_0_1px_0_rgba(255,255,255,.85),0_8px_18px_-10px_rgba(0,0,0,.18)]",
};

export function Button({
  variant = "ink",
  size = "lg",
  block = true,
  className = "",
  ...props
}: {
  variant?: Variant;
  size?: Size;
  /** Stretch to the container. True by default, because the phone screen is the common case. */
  block?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`${base} ${sizes[size]} ${block ? "w-full" : "w-auto"} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
