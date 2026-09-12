"use client";
import { useEffect } from "react";
import { TextMorph } from "torph/react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"] as const;

/**
 * Groups the integer part for display, leaving the value itself untouched.
 *
 * The keypad's state is the raw string the user typed, and it has to stay that way: it is parsed
 * into an on-chain amount, and separators in it would have to be stripped again everywhere
 * downstream. So grouping happens here, at the last possible moment, on the way to the screen.
 *
 * The fraction is passed through verbatim rather than reformatted, because a value being typed
 * passes through states a formatter would destroy: "12." would lose its point and "1.50" its
 * trailing zero, and both would fight the keystroke that produced them.
 */
function grouped(value: string): string {
  const [whole = "", fraction] = value.split(".");
  const withSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? withSeparators : `${withSeparators}.${fraction}`;
}

/** True while the caret is somewhere a keystroke already belongs to. */
function typingElsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

export function Keypad({
  value,
  onChange,
  symbol,
  onQuick,
  invalid = false,
  hint,
}: {
  value: string;
  onChange: (next: string) => void;
  symbol: string;
  onQuick: (pct: number) => void;
  invalid?: boolean;
  hint?: string;
}) {
  const press = (k: string) => {
    if (k === ".") {
      if (!value.includes(".")) onChange(`${value}.`);
      return;
    }
    onChange(value === "0" ? k : value + k);
  };
  const back = () => onChange(value.length > 1 ? value.slice(0, -1) : "0");
  const display = grouped(value);

  /**
   * The physical keyboard, which this had no answer to at all.
   *
   * The pad is buttons, not an `<input>`, so a laptop user typing "250" got nothing: the digits
   * went to the page and vanished. The on-screen pad is right for a phone and is not a reason to
   * refuse a keyboard when there is one.
   *
   * Bound to the window rather than to a focused element, because nothing here is focusable by
   * default and asking someone to click the number first would be a stranger interaction than the
   * one being fixed. The guard is what keeps that safe: a keystroke aimed at a real input, or
   * carrying a modifier (so browser shortcuts still work), is left alone.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typingElsewhere(event.target)) return;

      if (event.key === "Backspace") {
        event.preventDefault();
        back();
        return;
      }
      if (/^[0-9]$/.test(event.key) || event.key === "." || event.key === ",") {
        event.preventDefault();
        // A comma is the decimal separator on most of the world's keyboards, and the numeric
        // keypad emits whichever the layout says. Both mean the same thing here.
        press(event.key === "," ? "." : event.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <div
          className={`text-center text-[60px] font-semibold leading-none tracking-[-.03em] [font-variant-numeric:tabular-nums] ${invalid ? "text-neg" : ""}`}
        >
          <span>{symbol}</span>
          {/* `cursorIndex` at the end of the string is what makes this read as typing: torph
              matches digits by place value, so without it appending a digit re-shuffles every
              column and "12" -> "125" animates as three numbers changing instead of one arriving. */}
          {/* The testid sits on the wrapper: TextMorph owns its own element and does not forward
              arbitrary props onto it. */}
          <span data-testid="keypad-value">
            <TextMorph as="span" numbers cursorIndex={display.length} className="inline-block">
              {display}
            </TextMorph>
          </span>
          <span
            className={`ml-[3px] inline-block h-[50px] w-[2px] animate-pulse align-[-7px] ${invalid ? "bg-neg" : "bg-ink"}`}
          />
        </div>
        {hint !== undefined && (
          <div className="mt-3 h-5 text-center text-[13.5px] font-medium text-neg">
            {invalid ? hint : ""}
          </div>
        )}
      </div>
      <div className="mb-2 flex gap-2.5">
        {(
          [
            ["10%", 0.1],
            ["50%", 0.5],
            ["Max", 1],
          ] as const
        ).map(([label, pct]) => (
          <button
            type="button"
            key={label}
            onClick={() => onQuick(pct)}
            className="h-[52px] flex-1 rounded-[18px] bg-pill text-[15px] font-semibold text-ink"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mb-3.5 grid grid-cols-3 gap-0.5">
        {KEYS.map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => press(k)}
            className="h-14 rounded-[14px] text-2xl font-medium text-ink active:bg-pill"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Backspace"
          onClick={back}
          className="grid h-14 place-items-center rounded-[14px] active:bg-pill"
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z" />
            <path d="M15 10l-4 4M11 10l4 4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
