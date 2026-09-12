"use client";
import { formatUnits } from "viem";
import { useCreditHistory } from "../../hooks/useCreditHistory";

/**
 * How much has come out of the card, and nothing else.
 *
 * **Counted from `Draw` events, never from the wallet balance.** The wallet holds tCTC from
 * faucets, from other people, from whatever the holder was already doing on Creditcoin — and none
 * of that came from this card. A figure that read the balance would present all of it as spending,
 * which is the specific way this number would mislead: it would make a card that has never been
 * used look heavily used.
 *
 * So the only thing summed here is what the credit line paid out, and every one of those is a
 * transaction the holder signed against their own limit.
 *
 * Repayments are not netted off. This is what has been taken, not what is still owed; the balance
 * owed has its own row on Home and they answer different questions.
 *
 * **Zero is shown, not hidden.** Hiding it left "50.0000 tCTC" under the collateral row as the only
 * tCTC figure on the screen, and that number is what the collateral is worth, not what was spent.
 * A stated zero is what tells the two apart, so the row that looked like noise was the one doing
 * the work. That holds for a zero the indexer returned, not for one produced by failing to reach
 * it — the row disappears then, because it has nothing to report.
 */

const ctc = (value: bigint): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

export function SpentTotal({ className = "" }: { className?: string }) {
  const { borrowed, loading, error } = useCreditHistory();

  // Withheld while unread, and withheld when the read failed. An unresolved query is not a zero,
  // and neither is an indexer that never answered: "0 tCTC" in either case states something not
  // known. The stated zero this component exists for is the one that came back from a live read.
  if (loading || error) return null;

  return (
    <div
      className={`flex items-baseline justify-between gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)] ${className}`}
    >
      <span className="text-[13px] text-muted">Spent from your card</span>
      <span className="text-[15px] font-semibold tabular-nums">{ctc(borrowed)} tCTC</span>
    </div>
  );
}
