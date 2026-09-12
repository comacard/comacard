"use client";
import { TextMorph } from "torph/react";
import { Spinner } from "./Spinner";
import { TX_LABEL, type TxStatus } from "./TransactionStatus";

/**
 * The transaction's state, inside the button that started it.
 *
 * The screens used to show a status pill *and* a button reading "Confirm in your wallet…", which
 * said the same thing twice in two different wordings a few pixels apart. The button is the better
 * home for it: it is the thing that was pressed, so it is where a person looks for what happened
 * next, and a control that reports its own state does not need a second control to explain it.
 *
 * The pill still exists for `failed`, which carries a reason and an explorer link that have nowhere
 * to go inside a button.
 *
 * One morphing element rather than labels that swap, so "Sign in your wallet" becoming "Processing
 * Transaction" reads as the same transaction moving rather than a new message arriving.
 */
export function PendingLabel({ status }: { status: Extract<TxStatus, "signing" | "confirming"> }) {
  return (
    <>
      <Spinner size={16} className="-ml-1 shrink-0" />
      <TextMorph numbers={false}>{TX_LABEL[status]}</TextMorph>
    </>
  );
}
