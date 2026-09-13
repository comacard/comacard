"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useWallet } from "../../hooks/useWallet";
import { SubHeader } from "../ui/SubHeader";

/**
 * Where the credit ends up, asked before the amount.
 *
 * **Both routes go through your own wallet, and the screen says so.** `draw()` ends in
 * `Address.sendValue(payable(msg.sender), amount)` — there is no destination parameter, and there
 * cannot be one: the credit line pays the borrower, and anything after that is an ordinary transfer
 * the line knows nothing about. So "to another wallet" is not a different kind of send, it is the
 * same send plus a second transaction.
 *
 * That is why the subtitles name **signatures** rather than recipients. The recipient is the obvious
 * difference and the uninteresting one; what actually changes is how many times a person signs and
 * how long it takes, and a picker that hid the second signature would be selling a transfer feature
 * this product does not have.
 *
 * The reference app this is modelled on offers "To Kolo User", "To IBAN" and "Between Wallets"
 * alongside. None of those exist here — there is no directory of users, no bank rail, and one wallet
 * per holder — and a row that opens a screen saying "coming soon" is worth less than no row.
 */

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

function Option({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-[13px] rounded-[16px] border border-line bg-white px-4 py-4 no-underline transition-colors hover:bg-[#fafafa] [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pill text-ink-2">
        {icon}
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[14.5px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{description}</span>
      </span>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className="shrink-0 text-faint"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  );
}

const glyph = (d: string) => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

export function SendPicker() {
  const { address } = useWallet();

  return (
    <div className="stagger">
      <SubHeader title="Send" />

      <div className="flex flex-col gap-2.5">
        <Option
          href="/send/me"
          icon={glyph(
            "M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h3v-4Z",
          )}
          title="To my wallet"
          description={
            address
              ? `One signature. Lands in ${short(address)}`
              : "One signature. Lands in the wallet you signed in with"
          }
        />
        <Option
          href="/send/to"
          icon={glyph("M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z")}
          title="To another wallet"
          description="Two signatures — it reaches your wallet first, then goes on"
        />
      </div>

      {/* Said once, here, rather than discovered at the second signature. */}
      <p className="mt-4 px-1 text-[12px] leading-snug text-muted">
        Your credit is always paid to your own wallet first. That is the credit line, not a
        limitation of this screen.
      </p>
    </div>
  );
}
