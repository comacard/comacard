"use client";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { AuthGate } from "../../components/AuthGate";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { desktopTarget } from "../../lib/comacard/desktopRoutes";

/**
 * Desktop has no full-page flows: Deposit / Withdraw / Activity are drawers on the Overview,
 * and there is no desktop design for these routes. A desktop visitor who reaches a (flow) URL (typed,
 * bookmarked, or a stale deep link) is sent to /home with the matching drawer open; anything else
 * falls back to /home. Mobile is untouched: `useIsDesktop` is false there, so children render as
 * before. This lives in the layout so the shared flow components (AddFunds/DepositKeypad/…) stay
 * byte-identical: desktop UI never navigates here (it uses `open(panel)`), only manual URLs do.
 */
/**
 * Which routes render here and which redirect is `lib/comacard/desktopRoutes.ts`, so the decision
 * can be tested as a function rather than by rendering this layout once per path.
 */
export default function FlowLayout({ children }: { children: ReactNode }) {
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const router = useRouter();

  // One call, so a caller cannot consult one list and forget the other.
  const target = desktopTarget(pathname);

  useEffect(() => {
    if (!isDesktop || target === null) return;
    router.replace(target);
  }, [isDesktop, target, router]);

  return (
    <AuthGate>
      {/*
        `flex flex-col` so a screen inside can fill this column with `flex-1` instead of restating
        the padding set here. Twenty-one places across seven files carried
        `min-h-[calc(100dvh-92px)]`, and 92 is nothing but `pt-[52px]` plus `pb-10` added up by hand.
        Nothing connected the two, so changing the padding here would have left every flow screen
        the wrong height with no error anywhere. `min-h-dvh` with `border-box` already makes this
        content box exactly `100dvh - 92px`, so a `flex-1` child measures the same and keeps
        measuring the same.
      */}
      <div className="relative flex min-h-dvh flex-col bg-bg px-5 pb-10 pt-[52px] lg:mx-auto lg:max-w-[440px]">
        {isDesktop && target !== null ? null : children}
      </div>
    </AuthGate>
  );
}
