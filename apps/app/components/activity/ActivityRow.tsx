import type { ActivityItem } from "../../lib/comacard/activity";

/**
 * The six kinds `useTransactions` emits, worded for someone who has used a secured credit card and
 * never a blockchain: a security deposit earns a limit, you spend against it, you pay it back. No
 * chain names in a title.
 *
 * There were twenty cases here and fourteen could never fire — "Put to work", "Rewards added",
 * "Auto reinvest updated", freeze, proposed-exit, sign-mandate, consented, approve-exit. All of them
 * described a SoroSense agent moving money between Stellar yield buckets, which is not a thing this
 * product does. Dead branches in a `switch` are worse than dead files: they read as behaviour.
 */
function humanize(item: ActivityItem): { title: string; description: string } {
  switch (item.kind) {
    case "drew":
      return { title: "Spent", description: item.detail };
    case "repaid":
      return { title: "Payment", description: item.detail };
    case "collateral-locked":
      // "Deposit", not "Deposit". It sits directly above "Deposit confirmed" once the
      // guardians have signed, and the pair read as two different things rather than two moments
      // of one.
      return { title: "Deposit", description: item.detail };
    case "collateral-released":
      return { title: "Deposit returned", description: item.detail };
    case "proved":
      return { title: "Deposit confirmed", description: item.detail };
    case "defaulted":
      return { title: "Missed payment", description: item.detail };
    default:
      return { title: item.detail, description: "" };
  }
}

function ActivityIcon({ kind }: { kind: string }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (kind) {
    case "repaid":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
      );
    case "drew":
    case "collateral-released":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 21V9" />
          <path d="m7 14 5-5 5 5" />
          <path d="M5 3h14" />
        </svg>
      );
    case "collateral-locked":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M17 7.5c0-1.7-2.1-2.8-5-2.8s-5 1.1-5 2.8 2.1 2.8 5 2.8 5 1.1 5 2.8-2.1 2.8-5 2.8-5-1.1-5-2.8" />
        </svg>
      );
    case "defaulted":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M10 9v6" />
          <path d="M14 9v6" />
        </svg>
      );
    case "proved":
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    default:
      return (
        // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden comes from the spread
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
  }
}

export function ActivityRow({
  item,
  first,
  divider = true,
}: {
  item: ActivityItem;
  first: boolean;
  divider?: boolean;
}) {
  const copy = humanize(item);
  const className = `flex items-center gap-[13px] py-3.5 ${first || !divider ? "" : "border-t border-line"}`;

  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pill text-pill-ink">
        <ActivityIcon kind={item.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-[13.5px] font-semibold">{copy.title}</div>
          {item.when && <div className="shrink-0 text-xs font-medium text-muted">{item.when}</div>}
        </div>
        {copy.description && <div className="mt-0.5 text-xs text-muted">{copy.description}</div>}
      </div>
    </>
  );

  // On-chain rows carry `href`; fixture rows do not and stay plain divs. The anchor inherits colour
  // and carries no underline, so a row that links looks exactly like a row that does not.
  return item.href ? (
    <a
      href={item.href}
      target="_blank"
      rel="noreferrer"
      className={`${className} text-inherit no-underline`}
    >
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}
