"use client";
import { TextMorph } from "torph/react";

/**
 * The pill a transaction lives inside, from signature to confirmation.
 *
 * One element that morphs rather than three that swap. "Processing Transaction" and "Transaction
 * Safe" share a whole word, and keeping it in place is what makes the change read as the same
 * transaction progressing instead of a new message arriving.
 *
 * A chain transaction has three moments a person needs to tell apart, and they are not the same
 * thing: waiting for a signature in the wallet, waiting for the chain, and done. Collapsing them
 * into one spinner is how "is it stuck?" happens.
 */
export type TxStatus = "signing" | "confirming" | "confirmed" | "failed";

const LABEL: Record<TxStatus, string> = {
  signing: "Sign in your wallet",
  confirming: "Processing Transaction",
  confirmed: "Transaction Safe",
  failed: "Transaction Failed",
};

function Mark({ status }: { status: TxStatus }) {
  if (status === "confirmed") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path d="m8.5 12 2.4 2.4 4.6-4.8" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    );
  }
  // Waiting. Stilled under reduced motion, where a permanent spin is a distraction, not a signal.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" className="motion-safe:animate-spin">
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function TransactionStatus({
  status,
  detail,
  href,
  className = "",
}: {
  status: TxStatus;
  /** One line under the pill: the amount, or the reason it failed. */
  detail?: string;
  /** Explorer link, once there is a hash to look at. */
  href?: string;
  className?: string;
}) {
  const tone =
    status === "failed"
      ? "text-neg"
      : status === "confirmed"
        ? "text-pos"
        : "text-ink-2";

  return (
    <div
      role="status"
      aria-live="polite"
      data-status={status}
      className={`flex flex-col items-center gap-2 ${className}`}
    >
      <span className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white px-4 py-2.5 [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_12px_26px_-18px_rgba(17,19,22,.3)]">
        <span className={`shrink-0 ${tone}`}>
          <Mark status={status} />
        </span>
        <TextMorph numbers={false} className="text-[14px] font-semibold">
          {LABEL[status]}
        </TextMorph>
      </span>
      {detail && <span className="text-[12.5px] text-muted">{detail}</span>}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-[12.5px] font-medium text-muted underline underline-offset-2"
        >
          View transaction
        </a>
      )}
    </div>
  );
}
