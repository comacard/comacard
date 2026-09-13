"use client";
import gsap from "gsap";
import { useLayoutEffect, useRef } from "react";

/**
 * Tabs whose selection slides, rather than one pill turning grey while another turns white.
 *
 * The old markup put the background on whichever button was selected, so the highlight teleported.
 * Here the highlight is a single element behind the row and GSAP moves it, which is what makes the
 * change read as one thing moving instead of two things blinking.
 *
 * **Animated from measurements, not from CSS classes.** The pills are `flex-1`, so their width
 * depends on the container and on the labels; a transform written in advance would be wrong at any
 * width but one. `useLayoutEffect` measures the selected button after layout and before paint, so
 * the first render has the highlight in the right place with no visible jump.
 *
 * **`gsap.quickTo` rather than `gsap.to` per press.** It reuses one tween and retargets it, so
 * tapping across three tabs quickly steers a single moving highlight instead of stacking three
 * tweens that fight over the same property. `overwrite: "auto"` on the fade does the same job for
 * the label colours.
 *
 * Reduced motion is honoured by jumping to the end rather than by disabling the effect: the
 * highlight still has to be under the right tab, it just gets there in no time.
 */
export function SlidingTabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  /** Names the group for assistive tech. */
  label: string;
  className?: string;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const highlight = useRef<HTMLDivElement | null>(null);
  const moveX = useRef<((value: number) => void) | null>(null);
  const moveW = useRef<((value: number) => void) | null>(null);

  useLayoutEffect(() => {
    const container = row.current;
    const pill = highlight.current;
    if (!container || !pill) return;

    const selected = container.querySelector<HTMLButtonElement>(`[data-key="${value}"]`);
    if (!selected) return;

    const x = selected.offsetLeft;
    const width = selected.offsetWidth;

    // Someone who has asked for less motion still needs the highlight in the right place.
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      gsap.set(pill, { x, width });
      return;
    }

    // First paint: place it, do not animate in from zero.
    if (!moveX.current) {
      gsap.set(pill, { x, width });
      moveX.current = gsap.quickTo(pill, "x", { duration: 0.32, ease: "power3.out" });
      moveW.current = gsap.quickTo(pill, "width", { duration: 0.32, ease: "power3.out" });
      return;
    }

    moveX.current(x);
    moveW.current?.(width);
  }, [value]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: role=group on a styled container; a fieldset brings layout and legend semantics this is not
    <div ref={row} role="group" aria-label={label} className={`relative flex gap-1.5 ${className}`}>
      <div
        ref={highlight}
        aria-hidden="true"
        className="absolute left-0 top-0 h-9 rounded-full bg-[#ECECEC]"
      />
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          data-key={option.key}
          aria-pressed={option.key === value}
          onClick={() => onChange(option.key)}
          className={`relative h-9 flex-1 rounded-full text-[13.5px] font-medium transition-colors ${
            option.key === value ? "text-pill-ink" : "text-[#8a8a8a] hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The panel under the tabs, cross-faded when the selection changes.
 *
 * The caller gives it a `key` tied to the selection, so a changed tab is a new mount and this runs.
 * The list underneath can be any height, so the fade is paired with a small vertical offset rather
 * than a height tween: animating height against a list whose length changes is how a page ends up
 * jumping after the animation has already finished.
 */
export function TabPanel({ children }: { children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      gsap.set(element, { opacity: 1, y: 0 });
      return;
    }

    const tween = gsap.fromTo(
      element,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.28, ease: "power2.out", overwrite: "auto" },
    );
    return () => {
      tween.kill();
      // Left visible on unmount. A panel that tears down mid-tween must not be handed to the next
      // render at opacity 0, which is the classic way a list disappears and never comes back.
      gsap.set(element, { opacity: 1, y: 0 });
    };
    // No dependencies: this runs on mount, and the caller gives it a `key` so a changed tab is a
    // new mount. A dependency the effect never reads is a dependency that lies about what it needs.
  }, []);

  return <div ref={panel}>{children}</div>;
}
