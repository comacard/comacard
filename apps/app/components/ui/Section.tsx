import type { ReactNode } from "react";

/**
 * A titled block: a small muted heading, then whatever the block is.
 *
 * The markup here is not new — `mx-1 mb-2 text-sm font-medium text-muted` was already written out
 * by hand in five separate files, which is five chances for one of them to drift a pixel. The only
 * addition is `action`, a slot on the heading's right for the one control a section sometimes owns
 * (a "view all", a filter), because that row was otherwise being rebuilt inside each card.
 */
export function Section({
  title,
  action,
  className = "",
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={className}>
      <div className="mx-1 mb-2 flex min-h-5 items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
