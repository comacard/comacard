"use client";
import { formatUnits } from "viem";
import { cn } from "../../lib/utils";
import { Skeleton } from "../ui";

/**
 * The one figure the desktop Overview leads with, and it is not always the same figure.
 *
 * **This replaces a band of four equal tiles.** Available, limit, balance and lifetime spend were
 * rendered at identical weight, which says they are four peers; they are one number and three of
 * its derivations. Not one banking or card product surveyed uses a row of equal KPI tiles for its
 * primary money figures. Mercury's nearest equivalent is four inline 15px figures under a 19px
 * heading, deliberately subordinate.
 *
 * **It flips when a balance is open, and that is the rule every credit product follows.** Brex
 * leads with "the amount that you owe when your next statement is due"; Mercury leads with Total
 * Balance and demotes availability to a small line beneath. The rule underneath is: lead with the
 * figure the next action depends on. Most days that is spending power. Inside an open cycle it is
 * the repayment.
 *
 * **Set at reading size, not hero size.** Measured in Mercury's own app at 1278px: nothing on the
 * dashboard or the credit page exceeds 28px, and the balance, the page title and the greeting are
 * all the same 28px. The 65px figures reported for Mercury belong to its marketing site, not its
 * product. `CreditScreen` currently renders the same limit at 54px through a `clamp()` whose fluid
 * term is dead past a 450px viewport, so one number appears at two sizes 2.5x apart depending on
 * which page you are on.
 *
 * **"Balance" is Axel's choice over "You owe".** It is what Mercury and Brex use and it is short,
 * but on a product that is both debit and credit the word does not say which direction it points,
 * which is the ambiguity that made Amex name three separate balances. Two things compensate: the
 * figure takes the negative tone when anything is owed, and the sub-line says "repay in full to
 * close this cycle" rather than restating the number.
 */

const ctc = (value: bigint | undefined): string | null =>
  value === undefined
    ? null
    : Number(formatUnits(value, 18)).toLocaleString("en-US", { maximumFractionDigits: 4 });

export function OverviewHeadline({
  spendable,
  limit,
  drawn,
  score,
  loading = false,
  unissued = false,
  className = "",
}: {
  /**
   * What the card will actually authorise, as a decimal string from `apps/api`.
   *
   * Not `availableOf` off the credit line. `spendable` is the minimum of available credit and
   * whatever else gates the card, and recomputing it here is how a screen ends up promising credit
   * the card then refuses. `CardHero` has read it from the same place since it was written.
   */
  spendable: string | undefined;
  limit: bigint | undefined;
  drawn: bigint | undefined;
  score: bigint | undefined;
  loading?: boolean;
  /** KYC has not cleared, so there is no card and no figure to lead with. */
  unissued?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={cn("py-1", className)}>
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="mt-3 h-8 w-56 rounded" />
        <Skeleton className="mt-3 h-3.5 w-48 rounded" />
      </div>
    );
  }

  if (unissued) {
    return (
      <div className={cn("py-1", className)}>
        <div className="text-[13px] font-medium text-muted">Your card</div>
        <div className="mt-2 text-[28px] font-semibold leading-none tracking-[-.02em]">
          Not issued yet
        </div>
        <p className="mt-2 text-[13px] text-muted">Verify your identity and the card is ready.</p>
      </div>
    );
  }

  const owes = (drawn ?? 0n) > 0n;
  // The figure being led with. Undefined stays undefined all the way to the dash: a zero here is a
  // claim about someone's money made by a screen that has not finished asking.
  const headline = owes ? ctc(drawn) : (spendable ?? null);

  return (
    <div className={cn("py-1", className)}>
      <div className="text-[13px] font-medium text-muted">
        {owes ? "Balance" : "Available to spend"}
      </div>

      <div
        className={`mt-2 whitespace-nowrap text-[28px] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums] ${
          owes ? "text-neg" : ""
        }`}
      >
        {headline === null ? "—" : `${headline} tCTC`}
      </div>

      {/* Two facts, and which two depends on what the headline is. Both are the ones that decide
          what a person does next: how much room is left, and what closes the cycle. */}
      <p className="mt-2 text-[13px] text-muted [font-variant-numeric:tabular-nums]">
        {owes ? (
          <>
            {spendable ?? "—"} tCTC still available <span className="text-faint">·</span> repay in
            full to close this cycle
          </>
        ) : (
          <>
            of {ctc(limit) ?? "—"} tCTC limit <span className="text-faint">·</span> score{" "}
            {score === undefined ? "—" : String(score)}
          </>
        )}
      </p>
    </div>
  );
}
