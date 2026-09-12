"use client";
import { CountUp } from "../ui";
import type { ComacardAccount } from "../../lib/comacard/api";

/**
 * Home's headline figure: what the card can actually spend.
 *
 * This replaced a wallet total, and the swap is the point. The old hero read "Total value $813" —
 * the sum of CTC and ETH sitting in the wallet across two chains. Both numbers were true and the
 * pairing was misleading: on a credit card, the wallet balance is not the spending power. A holder
 * with 7,999 tCTC in their wallet and a 0.4975 tCTC limit can spend 0.4975, and the screen was
 * leading with the other figure by a factor of sixteen thousand.
 *
 * So the hero is `spendable`, which is the number the card is actually bounded by, and it comes
 * from the backend's own card state rather than being re-derived here: `spendable` is the minimum
 * of available credit and whatever else gates the card, and recomputing that in the client is how
 * a screen ends up promising credit the card will refuse.
 *
 * Limit and score sit underneath because they explain the headline. The score is there in
 * particular because it is the one figure the holder can move, and moving it raises the headline
 * without another deposit.
 */

function line(account: ComacardAccount | null): string | null {
  if (!account?.credit) return null;
  return `Limit ${account.credit.limitCtc} · Score ${account.credit.score}`;
}

export function CardHero({ account }: { account: ComacardAccount | null }) {
  const spendable = account ? Number(account.card.spendableCtc) : 0;
  const detail = line(account);
  // Three states, and the two that are not a number are not the same state. An unverified holder
  // has no card yet; a null account means the backend could not be read at all. Rendering 0.0000
  // for either reads as "your card is empty", which is a claim about money that nothing here
  // actually knows.
  const unissued = account !== null && !account.kyc.verified;
  const unknown = account === null;

  return (
    <div className="py-[26px] text-center">
      <div className="text-[15px] font-medium text-muted">
        {unissued ? "Your card" : "Spendable"}
      </div>
      {unissued || unknown ? (
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          {unissued ? "Not issued yet" : "—"}
        </div>
      ) : (
        <CountUp
          animateOnMount
          from={0}
          value={spendable}
          format={(n) =>
            `${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} tCTC`
          }
          className="mt-2 block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
        />
      )}
      {detail && !unissued && !unknown ? (
        <div className="mt-2.5 text-[12.5px] font-medium text-faint tabular-nums">{detail}</div>
      ) : null}
    </div>
  );
}
