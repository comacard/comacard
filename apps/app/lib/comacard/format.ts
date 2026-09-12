/**
 * Display shapes for card figures. Nothing here changes a value, only how it is read.
 *
 * The account number arrives as twelve unbroken digits, which is the correct thing for the backend
 * to send and the wrong thing to put in front of a person: an unbroken run of digits has to be
 * counted rather than read, and cannot be checked against a statement at a glance. Grouping is
 * presentation only, so the copy button still hands over the raw digits: a payment form that gets
 * spaces pasted into it rejects them.
 */

/** `483920174655` → `4839 2017 4655`. Non-digits are dropped before grouping. */
export function groupAccountNumber(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.match(/.{1,4}/g)?.join(" ") ?? digits;
}
