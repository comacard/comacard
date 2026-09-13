"use client";
import { formatUnits } from "viem";
import { useCreditLine } from "../../hooks/useCreditLine";

/**
 * What is still owed on the card.
 *
 * **This used to be lifetime spend and it was answering the wrong question.** It summed every
 * `Draw` event and never netted repayments off, which is a true figure and not the one anybody
 * opens Home to check. Worse, it was rendered only when nothing was owed, so the screen showed
 * "Spent from your card 13 tCTC" immediately after a repayment cleared the balance, and showed
 * nothing at all while there was a balance to clear. Exactly backwards. Axel repaid in full and
 * reasonably read the 13 as still outstanding.
 *
 * So the row is the balance, it is always rendered, and it goes to zero when the card is settled.
 * Lifetime spending is still on Credit, where the chart is about history.
 *
 * **Read from the chain, not the indexer.** `accountOf.drawn` is the outstanding principal and it
 * is what `repay` settles against. The indexer's `Account` row is as of that account's last
 * transaction, so for the seconds after a repayment it still reports the old debt, which is the one
 * moment this row is being looked at hardest.
 *
 * A zero is shown rather than hidden. "0 tCTC" is the answer to "do I owe anything", and it is the
 * answer people come here for. An unread figure is still withheld: the row disappears while the
 * call is in flight, because an unresolved read is not a zero.
 */

const ctc = (value: bigint): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

export function SpentTotal({ className = "" }: { className?: string }) {
  const { drawn, loading } = useCreditLine();

  // `drawn` is undefined until `accountOf` answers. Printing 0 then would be a claim that the card
  // is settled, made by a screen that has not asked yet.
  if (loading || drawn === undefined) return null;

  return (
    <div
      className={`flex items-baseline justify-between gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)] ${className}`}
    >
      <span className="text-[13px] text-muted">Balance</span>
      <span className={`text-[15px] font-semibold tabular-nums ${drawn > 0n ? "text-neg" : ""}`}>
        {ctc(drawn)} tCTC
      </span>
    </div>
  );
}
