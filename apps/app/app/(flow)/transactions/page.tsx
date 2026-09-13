"use client";
import { useEffect, useState } from "react";
import { ActivityList } from "../../../components/activity/ActivityList";
import { SubHeader } from "../../../components/ui";
import { useTransactions } from "../../../hooks/useTransactions";

/**
 * Every on-chain thing that has happened to this wallet, newest first.
 *
 * The filters are named for a secured credit card, which is the thing most people have actually
 * held: you put down a deposit, you get a limit, you spend and you pay it back. "Collateral",
 * "attestation" and the chain names stay out of the tabs; they are accurate and they are also the
 * vocabulary that makes a person close the screen.
 */
const FILTERS = [
  { key: "all", label: "All" },
  { key: "card", label: "Card" },
  { key: "deposit", label: "Deposit" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const EMPTY_COPY: Record<FilterKey, { title: string; description: string }> = {
  all: {
    title: "No transactions yet",
    description: "Put down a deposit and everything that follows will show here.",
  },
  card: {
    title: "Nothing spent yet",
    description: "What you spend and pay back on the card will show here.",
  },
  deposit: {
    title: "No deposit yet",
    description: "Money you put down to earn your limit will show here.",
  },
};

export default function TransactionsPage() {
  const { loading, items } = useTransactions();
  const [filter, setFilter] = useState<FilterKey>("all");
  // Read after mount, never during render: deciding "Today" while rendering bakes the server's
  // clock into the HTML and makes the first client paint disagree with it.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Through a frame rather than synchronously: setting state inside an effect body cascades a
    // render, and the lint rule that catches it is right. Same shape as CreditScreen.
    const frame = requestAnimationFrame(() => setNow(Date.now()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const shown = filter === "all" ? items : items.filter((item) => item.group === filter);
  const empty = EMPTY_COPY[filter];

  return (
    <div className="pb-8">
      <div className="stagger">
        <SubHeader title="Transactions" />
        <div className="mb-3.5 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`h-9 flex-1 rounded-full text-[13.5px] font-medium transition-colors ${filter === f.key ? "bg-[#ECECEC] text-pill-ink" : "text-[#8a8a8a] hover:text-ink"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {/* The full history is the one place day headings earn their space: it is long, and "3h ago"
            stops being useful the moment the list runs past yesterday. The three-row previews on
            Home stay ungrouped. */}
        <ActivityList
          items={shown}
          loading={loading}
          grouped
          now={now}
          emptyTitle={empty.title}
          emptyDescription={empty.description}
        />
      </div>
    </div>
  );
}
