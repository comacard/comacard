"use client";

/**
 * The control that flips the headline between tCTC and dollars.
 *
 * Two arrows chasing each other, which is the mark this gesture carries in every wallet and
 * exchange a cardholder has used. It sits beside the figure rather than under it, because it acts
 * on that one number and nothing else on the screen.
 *
 * **It renders as a real button with a real name.** `aria-label` says which direction the press
 * goes, not just "swap", so somebody who cannot see the figure still knows what changes. And it is
 * only ever mounted when there is a price to swap to: a control that cannot do anything is worse
 * than one that is absent, because absence is silent and a dead button is a question.
 */
export function CurrencySwap({ to, onClick }: { to: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show in ${to}`}
      title={`Show in ${to}`}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-pill active:scale-[.94]"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Top arrow running right, bottom arrow running left: the loop reads as an exchange rather
            than as a refresh, which the same two arrows drawn as a circle would. */}
        <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
      </svg>
    </button>
  );
}
