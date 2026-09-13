/**
 * The foot of a list that is showing part of itself.
 *
 * Lifted out of `ActivityList`, which had it inline, once the asset list needed the same control.
 * Two lists paginating in two visibly different ways is the kind of difference a reader has to stop
 * and interpret, and there is nothing to interpret here.
 *
 * A button rather than an infinite scroll: the lists it sits under are short, and a scroll handler
 * that fetches is a scroll handler that fires while someone is reading.
 */
export function LoadMore({
  onClick,
  label = "Load more",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-[3px] pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted transition-colors hover:text-ink"
    >
      {label}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
