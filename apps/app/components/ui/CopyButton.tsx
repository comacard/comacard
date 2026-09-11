"use client";
import { useEffect, useRef, useState } from "react";
import { TextMorph } from "torph/react";

/**
 * Copy-to-clipboard whose label morphs between states instead of swapping.
 *
 * The morph is not decoration here. "Copy" and "Copied" share four letters, so a hard swap reads as
 * a flicker and people re-tap thinking it missed; letting the shared letters stay put makes the
 * change legible at a glance. `torph` keeps the common prefix and animates only what differs.
 *
 * Failure is a state, not a silence. `navigator.clipboard` rejects on an insecure origin and in
 * some in-app browsers, and a button that looks like it worked is worse than one that says it did
 * not.
 */
type State = "idle" | "copied" | "failed";

const LABEL: Record<State, string> = { idle: "Copy", copied: "Copied", failed: "Press to select" };

export function CopyButton({
  value,
  label = "Copy",
  className = "",
  onCopied,
}: {
  value: string;
  /** Accessible name; the visible text is the morphing state label. */
  label?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [state, setState] = useState<State>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
      onCopied?.();
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      aria-label={label}
      data-state={state}
      className={`inline-flex h-8 shrink-0 items-center rounded-full bg-pill px-3 text-[12.5px] font-semibold text-pill-ink transition-colors hover:bg-line ${className}`}
    >
      <TextMorph numbers={false}>{LABEL[state]}</TextMorph>
    </button>
  );
}
