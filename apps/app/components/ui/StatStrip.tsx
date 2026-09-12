import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

/**
 * The four figures a cardholder opens the app for, in one band above everything else.
 *
 * This is the piece the desktop Overview was missing, and its absence was the expensive one. The
 * screen's entire subject is three numbers — what the limit is, what is left to spend, what is owed
 * — and not one of them was anywhere the eye lands first. Spendable was a figure inside a card
 * inside the left column; the balance owed lived in a sub-panel that only existed while it was
 * non-zero, so the answer to "do I owe anything" was the presence or absence of a box; the limit
 * was on another screen entirely. Every dashboard measured puts this band first: Aave gives it a
 * full-width panel above its columns, debank a summary row.
 *
 * One card divided by hairlines rather than four floating cards. Four separate shadowed boxes read
 * as four separate objects that happen to be adjacent; these are four readings off one instrument,
 * and the shared border is what says so.
 *
 * A tile with `value === null` renders a dash, not a zero. Zero is a fact about the account —
 * "nothing is owed" — and an unread contract is not that fact.
 */

export type Stat = {
  label: string;
  /** Already formatted. Null means not known yet, which is not the same as zero. */
  value: string | null;
  /** Small print under the figure: a unit, a qualifier, a reason it is what it is. */
  hint?: string;
  tone?: "ink" | "neg";
};

export function StatStrip({
  stats,
  loading = false,
  className = "",
}: {
  stats: Stat[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <Card className={`grid grid-cols-2 lg:grid-cols-4 ${className}`}>
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`px-6 py-[18px] ${
            // Hairlines between tiles only, never around the strip: the card's own border is the
            // outer edge. Two columns on a narrow window means the divider pattern differs by row.
            i % 2 === 1 ? "border-l border-line" : ""
          } ${i >= 2 ? "border-t border-line lg:border-t-0" : ""} ${
            i === 2 ? "lg:border-l lg:border-line" : ""
          }`}
        >
          <div className="text-[13px] font-medium text-muted">{stat.label}</div>
          {loading ? (
            <Skeleton className="mt-2.5 h-[22px] w-24 rounded" />
          ) : (
            <div
              className={`mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-[-.01em] [font-variant-numeric:tabular-nums] ${
                stat.tone === "neg" ? "text-neg" : ""
              }`}
            >
              {stat.value ?? "—"}
            </div>
          )}
          {stat.hint ? <div className="mt-1 text-[12.5px] text-faint">{stat.hint}</div> : null}
        </div>
      ))}
    </Card>
  );
}
