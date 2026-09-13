"use client";
import { ChainBadge } from "./ChainBadge";

/**
 * A row of chains, one of them selected.
 *
 * Six networks do not fit across a phone, so the row scrolls rather than wrapping onto a second
 * line: a control that changes height when a name is long pushes everything under it around. The
 * negative margin lets the first and last pills reach the screen edge while their text keeps the
 * page's padding, which is how a scrolling row reads as scrollable without a scrollbar.
 *
 * Rendered as tabs rather than a `<select>` because the whole point is that the other chains are
 * visible. The list is short, fixed, and the reason someone opened this screen is usually to find
 * out which chains exist at all.
 */
export function NetworkTabs({
  chains,
  names,
  selected,
  onSelect,
  label,
}: {
  /** Wormhole chain ids. The same ids `WORMHOLE_CHAIN_NAMES` and `NATIVE_SYMBOL` are keyed by. */
  chains: number[];
  names: Record<number, string>;
  selected: number;
  onSelect: (chain: number) => void;
  label: string;
}) {
  return (
    <div
      // A tablist, so a screen reader announces "2 of 6" rather than reading six unrelated buttons.
      role="tablist"
      aria-label={label}
      className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {chains.map((chain) => {
        const active = chain === selected;
        return (
          <button
            key={chain}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(chain)}
            className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-colors ${
              active ? "bg-ink text-[#f8f8f8]" : "bg-pill text-pill-ink hover:bg-[#ececec]"
            }`}
          >
            <ChainBadge chainName={names[chain] ?? String(chain)} size={16} />
            {names[chain] ?? `Chain ${chain}`}
          </button>
        );
      })}
    </div>
  );
}
