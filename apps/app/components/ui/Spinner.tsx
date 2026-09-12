/**
 * The waiting mark, shared by every control that holds while a chain does something.
 *
 * An open arc rather than a full ring, because a full circle spinning reads as a texture and an arc
 * reads as motion. Stilled under reduced motion: a permanent spin is a distraction there, not a
 * signal, and the label beside it already says what is happening.
 */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden="true"
      className={`motion-safe:animate-spin ${className}`}
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}
