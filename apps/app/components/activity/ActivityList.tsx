"use client";
import { useState } from "react";
import type { ActivityItem } from "../../lib/comacard/activity";
import { Skeleton } from "../ui";
import { ActivityRow } from "./ActivityRow";

/**
 * "Today", "Yesterday", then the date. Rows arrive newest first and a heading is emitted whenever
 * the day changes, so the list splits without a second pass.
 *
 * `at` is epoch ms rather than the rendered `when`: "3h ago" cannot tell you which day it was, and
 * two rows four hours apart can straddle midnight. Rows with no `at` fall into one trailing group
 * with no heading, which is what the fixture rows and anything hand-built do.
 */
function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(at: number, now: number): string {
  const a = dayKey(at);
  if (a === dayKey(now)) return "Today";
  if (a === dayKey(now - 86_400_000)) return "Yesterday";
  return new Date(at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    // The year only when it is not this one. "12 Sep 2025" on every row is noise.
    year: new Date(at).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  });
}

const LoadMore = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-center gap-[3px] pb-[3px] pt-[13px] text-[13.5px] font-medium text-muted transition-colors hover:text-ink"
  >
    Load more
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

export function ActivityList({
  items,
  divider = true,
  loading = false,
  grouped = false,
  now,
  pageSize,
  emptyTitle,
  emptyDescription,
}: {
  items: ActivityItem[];
  divider?: boolean;
  loading?: boolean;
  /** Split into a titled block per day. Off by default: the previews on Home show three rows and a
   *  heading above each would be more chrome than list. */
  grouped?: boolean;
  /** Epoch ms, read after mount by the caller. Required for `grouped`, because deciding "Today"
   *  during render bakes the server's clock into the HTML. */
  now?: number | null;
  /** Show this many rows and a "Load more" beneath. Unset renders everything, which is what the
   *  Home previews want — they slice to three before they get here. */
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  // Without dividers the rows blend together, so give them a little breathing room instead.
  const wrap = divider ? "" : "flex flex-col gap-1";
  const [shown, setShown] = useState(pageSize ?? Number.POSITIVE_INFINITY);
  const visible = pageSize === undefined ? items : items.slice(0, shown);
  const more = visible.length < items.length;

  if (loading) {
    return (
      <div className={wrap}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-[13px] py-3.5 ${divider && i !== 0 ? "border-t border-line" : ""}`}
          >
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-2 h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0 && emptyTitle) {
    return (
      <div className="fade-in flex flex-1 flex-col items-center justify-center px-5 py-7 text-center">
        <div className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.2)]">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-ink-2"
            aria-hidden="true"
          >
            <path d="M12 6v6l4 2" />
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
          </svg>
        </div>
        <p className="mt-3 text-[13.5px] font-semibold text-ink">{emptyTitle}</p>
        {emptyDescription && (
          <p className="mt-1 max-w-[230px] text-[12.5px] leading-snug text-muted">
            {emptyDescription}
          </p>
        )}
      </div>
    );
  }

  if (grouped && now != null) {
    const days: { label: string; rows: ActivityItem[] }[] = [];
    for (const item of visible) {
      const label = item.at === undefined ? "" : dayLabel(item.at, now);
      const last = days.at(-1);
      if (last && last.label === label) last.rows.push(item);
      else days.push({ label, rows: [item] });
    }
    return (
      <div className="fade-in flex flex-col gap-5">
        {days.map((day) => (
          <section key={`${day.label}-${day.rows[0]?.id}`}>
            {day.label ? (
              <h3 className="mx-1 mb-1.5 text-[12.5px] font-medium text-muted">{day.label}</h3>
            ) : null}
            {/* A card per day rather than one card around the whole list: the heading sits outside
                it, so a day reads as a block instead of a divider in a long sheet. */}
            <div className="rounded-[16px] border border-line bg-card px-5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
              {day.rows.map((item, i) => (
                <ActivityRow key={item.id} item={item} first={i === 0} divider />
              ))}
            </div>
          </section>
        ))}
        {more ? <LoadMore onClick={() => setShown((n) => n + (pageSize ?? 0))} /> : null}
      </div>
    );
  }

  return (
    <div className={`${wrap} fade-in`}>
      {visible.map((item, i) => (
        <ActivityRow key={item.id} item={item} first={i === 0} divider={divider} />
      ))}
      {more ? <LoadMore onClick={() => setShown((n) => n + (pageSize ?? 0))} /> : null}
    </div>
  );
}
