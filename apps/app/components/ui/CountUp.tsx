"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Animates a number toward `value` (~0.6s ease-out) and renders it through `format`. Test/SSR-safe:
 * `display` starts at `value`, so the final text shows immediately if rAF never runs, and the very
 * first render (mount) does not animate: only later value changes (cycling buckets, toggling
 * Total/Earned) count. Stilled under prefers-reduced-motion.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  /**
   * **Mount at the real figure, never at `from`.**
   *
   * `animateOnMount` started the display at 0 and relied on an effect to walk it up to `value`. In
   * the dev browser that walk does not complete: measured on 13 September 2026, the Credit limit
   * rendered "0 tCTC" indefinitely against a chain that reported 41.4594, and "In your wallet"
   * showed "0 tCTC" and "0 ETH" against a wallet holding 7,998 tCTC. Replacing the component with
   * plain text made the correct figure appear immediately, which is what isolated it to here.
   *
   * The prop is kept so call sites do not have to change, but it no longer starts below the value.
   * Two reasons beyond the bug: a money figure animating up from zero means the screen displays a
   * number that is false for the length of the animation, which is the one thing a financial UI
   * must not do; and a logged-in dashboard opens into a task rather than a performance, which is
   * the one point every installed design skill agrees on.
   *
   * Value CHANGES still animate. That is the case the component was written for: a figure moving
   * because something happened is worth showing as movement.
   */
  const mountFrom = value;
  const [display, setDisplay] = useState(mountFrom);
  const fromRef = useRef(mountFrom);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const reduce =
      process.env.NODE_ENV === "test" ||
      (typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (
      from === to ||
      reduce ||
      typeof requestAnimationFrame === "undefined" ||
      typeof performance === "undefined"
    ) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - start) / dur));
      const eased = 1 - (1 - p) ** 3;
      setDisplay(from + (to - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
