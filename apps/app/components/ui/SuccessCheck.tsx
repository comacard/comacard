/**
 * A tick that draws itself once, for the moment a transaction lands.
 *
 * The stroke is animated rather than faded in because a mark being drawn reads as something
 * completing, while a mark appearing reads as a static icon that was always going to be there. It
 * is the difference between "this just happened" and "this is a label".
 *
 * The ring draws first and the tick follows on a delay, so the two do not race. Under reduced
 * motion both are simply present: the information is the tick, not the drawing of it, and none of
 * it is load-bearing animation.
 */
export function SuccessCheck({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="9" strokeWidth={1.8} className="success-check-ring" />
      <path d="m8.5 12 2.4 2.4 4.6-4.8" strokeWidth={2.6} className="success-check-tick" />
    </svg>
  );
}
