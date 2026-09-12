"use client";
import type { PendingDeposit } from "../../lib/comacard/api";
import { Section, Spinner } from "../ui";

/**
 * Deposits locked on another chain and not yet delivered.
 *
 * Ported from the card screen in `apps/app/src` that this app replaced, because the problem it
 * solves is real and independent of which app renders it: Wormhole guardians sign at finalized
 * consistency, so the money leaves the wallet minutes before the limit moves. Without a row saying
 * so, the screen shows a deposit that did nothing, and that reads as a broken product rather than a
 * pending one.
 *
 * **`slow` is not `failed`.** Past the nominal wait the API reports a deposit as slow, and this
 * says exactly that. Nothing has gone wrong; guardians sign on their own schedule and the deposit
 * still lands. Calling it an error would send people looking for a problem that does not exist.
 *
 * Every figure arrives formatted from the API — the amount already scaled by the asset's own
 * decimals, the chain already named, the explorer link already built — so this holds no decimals
 * table and no chain map.
 */

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

export function IncomingDeposits({
  deposits,
  className = "",
}: {
  deposits: PendingDeposit[];
  className?: string;
}) {
  if (deposits.length === 0) return null;

  return (
    <Section title="Incoming" className={className}>
      <div className="rounded-[16px] border border-line bg-white px-4 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]">
        {deposits.map((deposit, i) => (
          <div
            key={deposit.id}
            className={`flex items-center gap-3 py-3.5 ${i === 0 ? "" : "border-t border-line"}`}
          >
            <span className="shrink-0 text-warn">
              <Spinner size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold">
                {deposit.amountFormatted} from {deposit.chain}
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted">
                {deposit.slow
                  ? `Taking longer than usual — ${minutes(deposit.elapsedSeconds)} min so far`
                  : `Arriving in about ${minutes(deposit.waitSeconds - deposit.elapsedSeconds)} min`}
              </div>
            </div>
            {deposit.lockTxUrl ? (
              <a
                href={deposit.lockTxUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-[12px] font-medium text-muted underline underline-offset-2"
              >
                View
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </Section>
  );
}
