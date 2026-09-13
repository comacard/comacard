"use client";
import { useState } from "react";
import { usePrices } from "../../hooks/usePrices";
import type { ComacardAccount } from "../../lib/comacard/api";
import { formatUsd, usdOf } from "../../lib/comacard/prices";
import { CountUp } from "../ui";
import { CurrencySwap } from "../ui/CurrencySwap";

/**
 * Home's headline figure: what the card can actually spend.
 *
 * This replaced a wallet total, and the swap is the point. The old hero read "Total value $813",
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
 * Nothing sits under it. The limit and the score were there to explain the headline and did the
 * opposite: three figures in a stack, two of which a reader has to already understand to know why
 * they differ. Both have a screen of their own where they are the subject.
 *
 * Left-aligned rather than centred. A centred figure with a row of actions under it makes the
 * actions look like a caption for it; aligned to the same edge they read as a column (label,
 * number, what you can do) and the eye travels one line rather than three.
 *
 * **The figure can be read in dollars, and only this figure.** tCTC means nothing to somebody who
 * has not looked up what Creditcoin trades at, and this is the number the whole screen is about. The
 * swap is deliberately not a global setting: the keypads on Send and Repay take an amount that gets
 * signed, and a dollar figure there would be a number nobody can actually enter.
 *
 * The button appears only when a price has been read. `usePrices` answers with an empty object when
 * CoinGecko is rate limited or unreachable, and then this is exactly the screen it was before, which
 * is the behaviour Axel asked for: a snapshot when there is one, and no apology when there is not.
 */

export function CardHero({ account }: { account: ComacardAccount | null }) {
  const { prices } = usePrices();
  const [inUsd, setInUsd] = useState(false);
  const spendable = account ? Number(account.card.spendableCtc) : 0;
  const usd = usdOf(spendable, "tCTC", prices);
  // Three states, and the two that are not a number are not the same state. An unverified holder
  // has no card yet; a null account means the backend could not be read at all. Rendering 0.0000
  // for either reads as "your card is empty", which is a claim about money that nothing here
  // actually knows.
  const unissued = account !== null && !account.kyc.verified;
  const unknown = account === null;

  return (
    <div className="py-[26px]">
      <div className="text-[15px] font-medium text-muted">
        {unissued ? "Your card" : "Spendable"}
      </div>
      {unissued || unknown ? (
        <div className="mt-2 text-[clamp(26px,8vw,34px)] font-semibold leading-tight tracking-[-.02em]">
          {unissued ? "Not issued yet" : "—"}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <CountUp
            // Keyed so the count animates through the change rather than cutting to the new figure:
            // the two numbers are the same money and the motion is what says so.
            key={inUsd ? "usd" : "ctc"}
            value={inUsd && usd !== null ? usd : spendable}
            format={(n) =>
              inUsd && usd !== null
                ? formatUsd(n)
                : `${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} tCTC`
            }
            className="block whitespace-nowrap text-[clamp(32px,12vw,54px)] font-semibold leading-none tracking-[-.02em] [font-variant-numeric:tabular-nums]"
          />
          {usd === null ? null : (
            <CurrencySwap to={inUsd ? "tCTC" : "US dollars"} onClick={() => setInUsd((v) => !v)} />
          )}
        </div>
      )}
    </div>
  );
}
