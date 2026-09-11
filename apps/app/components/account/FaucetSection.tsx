"use client";

import { CoinBadge } from "../ui";
import type { TokenSym } from "../ui/CoinBadge";

/**
 * Where to get testnet funds.
 *
 * Both faucets are somebody else's, and neither can be called from a browser: Creditcoin's is a
 * Discord bot command, and Google's is a captcha-gated web form. So these are links, not buttons
 * that mint. The label says "Request" rather than "Mint" for the same reason: nothing is minted
 * here, a request is made somewhere else and the tokens turn up later.
 *
 * This replaced a section that really did mint test USDC and EURC through the vault backend. That
 * backend is not part of Comacard, and the section had been rendering nothing since
 * `NEXT_PUBLIC_API_URL` was unset.
 */
const FAUCETS: { token: TokenSym; name: string; href: string }[] = [
  { token: "CTC", name: "Creditcoin", href: "https://discord.gg/creditcoin" },
  {
    token: "ETH",
    name: "Sepolia ETH",
    href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
];

const panel = [
  "flex items-center gap-3 rounded-[16px] border border-line bg-white",
  "[box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-16px_rgba(17,19,22,.22)]",
  "px-4 py-3.5",
].join(" ");

export function FaucetSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className={compact ? "px-2 pb-1 pt-1.5" : "mt-5"}>
      <h2
        className={
          compact
            ? "mb-2 px-1 text-[12px] font-semibold text-muted"
            : "ml-1 mb-2.5 text-sm font-medium text-muted"
        }
      >
        Faucet
      </h2>
      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {FAUCETS.map((row) => (
          <div
            key={row.token}
            className={
              compact ? "flex w-full items-center gap-[13px] rounded-xl px-3 py-2.5 text-left" : panel
            }
          >
            <CoinBadge token={row.token} size={compact ? 28 : 40} />
            <div className={`min-w-0 flex-1 ${compact ? "text-sm font-semibold" : "font-semibold"}`}>
              {row.name}
            </div>
            <a
              href={row.href}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-semibold text-[#f8f8f8] no-underline transition-transform active:scale-[.985] [background:linear-gradient(180deg,#3d3d40,#171719)] [box-shadow:inset_0_1px_0_rgba(255,255,255,.2),inset_0_-9px_16px_-9px_rgba(0,0,0,.6),0_10px_22px_-10px_rgba(0,0,0,.42)]"
            >
              Request
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}
