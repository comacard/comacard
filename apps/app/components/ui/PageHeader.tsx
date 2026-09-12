import type { ReactNode } from "react";

/**
 * The page's own name, above everything else on it.
 *
 * Desktop had none. The navigation bar ended and a card began, so the first thing a reader's eye
 * landed on was a rounded rectangle with no statement of what screen they were on — and with two
 * destinations in the bar now, "which one am I looking at" is a real question rather than a
 * rhetorical one. Every reference names its page: Aave sets a 32px/700 title at the top of the
 * content column, and so does every dashboard measured beside it.
 *
 * 26px rather than Aave's 32px. Their title is the market name and carries a chain switcher; this
 * one sits above a summary strip whose figures should stay the loudest thing on the screen.
 */
export function PageHeader({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  /** Controls that belong to the page rather than to any one block on it. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-none tracking-[-.02em]">{title}</h1>
        {description ? <p className="mt-1.5 text-[13.5px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}
