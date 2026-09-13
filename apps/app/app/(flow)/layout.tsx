"use client";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AuthGate } from "../../components/AuthGate";
import { useIsDesktop } from "../../hooks/useIsDesktop";

/**
 * Desktop has no full-page flows — Deposit / Withdraw / Activity are drawers on the Overview,
 * and there is no desktop design for these routes. A desktop visitor who reaches a (flow) URL (typed,
 * bookmarked, or a stale deep link) is sent to /home with the matching drawer open; anything else
 * falls back to /home. Mobile is untouched: `useIsDesktop` is false there, so children render as
 * before. This lives in the layout so the shared flow components (AddFunds/DepositKeypad/…) stay
 * byte-identical — desktop UI never navigates here (it uses `open(panel)`), only manual URLs do.
 */
/**
 * The two exceptions, and they are exceptions because there is nowhere to send them.
 *
 * Every other flow route has a desktop equivalent to redirect to — a drawer on the Overview. The
 * cross-chain asset screens do not: `/deposit/x/[id]` was being matched by the `/deposit/` rule and
 * bounced to `?panel=deposit`, which is the drawer the link was clicked *in*, so the desktop
 * cross-chain deposit went in a circle and could not be completed at all. Withdraw would have
 * inherited the same loop.
 *
 * They render on desktop instead. Both are keypad screens that work at any width, and capping the
 * column is the only desktop-specific thing they need.
 */
const RENDERS_ON_DESKTOP = (path: string): boolean =>
  path.startsWith("/deposit/x/") ||
  path.startsWith("/withdraw/x/") ||
  // `/send`, `/send/me` and `/send/to`. Send became a picker rather than a keypad, and there is no
  // desktop drawer to redirect it to — a desktop visitor clicking Send would land back on Home,
  // which is the loop `/deposit/x/[id]` was in before this list existed.
  path === "/send" ||
  path.startsWith("/send/");

const PANEL_ROUTES: { match: (path: string) => boolean; to: string }[] = [
  {
    match: (p) => p === "/add-funds" || p === "/deposit" || p.startsWith("/deposit/"),
    to: "/home?panel=deposit",
  },
  { match: (p) => p === "/transactions", to: "/home?panel=activity" },
];

export default function FlowLayout({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();

  const keep = RENDERS_ON_DESKTOP(pathname);

  useEffect(() => {
    if (!isDesktop || keep) return;
    const target = PANEL_ROUTES.find((r) => r.match(pathname))?.to ?? "/home";
    router.replace(target);
  }, [isDesktop, keep, pathname, router]);

  return (
    <AuthGate>
      <div className="relative min-h-dvh bg-bg px-5 pb-10 pt-[52px] lg:mx-auto lg:max-w-[440px]">
        {isDesktop && !keep ? null : children}
      </div>
    </AuthGate>
  );
}
