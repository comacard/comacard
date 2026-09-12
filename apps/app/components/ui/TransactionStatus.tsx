"use client";
import { TextMorph } from "torph/react";
import { Spinner } from "./Spinner";
import { SuccessCheck } from "./SuccessCheck";

/**
 * The pill a transaction lives inside, from signature to confirmation.
 *
 * One element that morphs rather than four that swap, so the pill reads as one transaction moving
 * through its states rather than a series of messages arriving.
 *
 * A chain transaction has three moments a person needs to tell apart, and they are not the same
 * thing: waiting for a signature in the wallet, waiting for the chain, and done. Collapsing them
 * into one spinner is how "is it stuck?" happens.
 */
export type TxStatus = "signing" | "confirming" | "confirmed" | "failed";

/** Shared with `PendingLabel`, so the button and the pill can never word the same state twice. */
export const TX_LABEL: Record<TxStatus, string> = {
  signing: "Sign in your wallet",
  confirming: "Processing Transaction",
  confirmed: "Successful",
  failed: "Transaction Failed",
};

function Mark({ status, size }: { status: TxStatus; size: number }) {
  // Drawn rather than faded in. The tick is the moment the transaction landed, and a mark being
  // drawn reads as something completing while a mark appearing reads as a label that was always
  // there.
  if (status === "confirmed") return <SuccessCheck size={size} />;
  if (status === "failed") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    );
  }
  return <Spinner size={size} />;
}

export function TransactionStatus({
  status,
  detail,
  href,
  size = "default",
  className = "",
}: {
  status: TxStatus;
  /** One line under the pill: the amount, or the reason it failed. */
  detail?: string;
  /** Explorer link, once there is a hash to look at. */
  href?: string;
  /** `large` for a screen whose only subject is this pill; `default` when it sits beside others. */
  size?: "default" | "large";
  className?: string;
}) {
  const large = size === "large";
  const tone =
    status === "failed" ? "text-neg" : status === "confirmed" ? "text-pos" : "text-ink-2";

  return (
    <div
      role="status"
      aria-live="polite"
      data-status={status}
      className={`flex flex-col items-center ${large ? "gap-3" : "gap-2"} ${className}`}
    >
      <span
        className={`inline-flex items-center rounded-full border border-line bg-white [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_12px_26px_-18px_rgba(17,19,22,.3)] ${
          large ? "gap-3 px-6 py-4" : "gap-2.5 px-4 py-2.5"
        }`}
      >
        <span className={`shrink-0 ${tone}`}>
          <Mark status={status} size={large ? 24 : 16} />
        </span>
        <TextMorph
          numbers={false}
          className={large ? "text-[20px] font-semibold" : "text-[14px] font-semibold"}
        >
          {TX_LABEL[status]}
        </TextMorph>
      </span>
      {detail && (
        <span className={large ? "text-[13.5px] text-muted" : "text-[12.5px] text-muted"}>
          {detail}
        </span>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className={`font-medium text-muted underline underline-offset-2 ${
            large ? "text-[13.5px]" : "text-[12.5px]"
          }`}
        >
          View transaction
        </a>
      )}
    </div>
  );
}
