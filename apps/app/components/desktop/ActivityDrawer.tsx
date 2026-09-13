"use client";
import { useState } from "react";
import { useTransactions } from "../../hooks/useTransactions";
import { ActivityList } from "../activity/ActivityList";
import { Segmented } from "../ui";
import { Drawer } from "../ui/Drawer";

const TABS = ["All", "Card", "Deposit"] as const;
type Tab = (typeof TABS)[number];
/** Tab → the ActivityItem.group it filters to (All is the UI-only sentinel). Same three the mobile
 *  Transactions page uses, named for a secured credit card rather than for the machinery. */
const TAB_CAT: Record<Tab, "card" | "deposit" | null> = {
  All: null,
  Card: "card",
  Deposit: "deposit",
};
const EMPTY_COPY: Record<Tab, { title: string; description: string }> = {
  All: {
    title: "No transactions yet",
    description: "Put down a deposit and everything that follows will show here.",
  },
  Card: {
    title: "Nothing spent yet",
    description: "What you spend and pay back on the card will show here.",
  },
  Deposit: {
    title: "No deposits yet",
    description: "Collateral you lock will show here.",
  },
};

/**
 * Desktop activity drawer: mirrors the mobile Activity page (interface-map §8) but the hand-rolled
 * tab buttons become the shared flat `Segmented` (variant="period"). ActivityList is reused AS-IS —
 * the `kind`→icon enhancement is deferred (pending Axel's reply on STE-48). Review → onReview (the
 * panel host opens the safe-exit dialog).
 */
export function ActivityDrawer({
  open,
  onClose,
  onReview,
}: {
  open: boolean;
  onClose: () => void;
  onReview: () => void;
}) {
  const { loading, items } = useTransactions();
  const [tab, setTab] = useState<Tab>("All");
  const cat = TAB_CAT[tab];
  const shown = cat === null ? items : items.filter((a) => a.group === cat);
  const empty = EMPTY_COPY[tab];
  return (
    <Drawer open={open} onClose={onClose} label="Activity">
      <div className="flex items-center justify-between border-b border-line px-[22px] pb-3.5 pt-5">
        <span className="text-[17px] font-semibold">Activity</span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="grid h-[34px] w-[34px] place-items-center rounded-full bg-pill text-ink-2"
        >
          <svg
            aria-hidden="true"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex-1 overflow-auto px-[22px] py-5">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Filter" variant="period" />
        <div className="mt-2">
          <ActivityList
            items={shown}
            loading={loading}
            onReview={onReview}
            // Always reviewed: `usePendingExit` was the SoroSense safe-exit seam, and this product has no
            // proposal for anyone to approve. Leaving the flag wired to a deleted hook would have been
            // the only reason to keep that hook alive.
            reviewed
            divider={false}
            emptyTitle={empty.title}
            emptyDescription={empty.description}
          />
        </div>
      </div>
    </Drawer>
  );
}
