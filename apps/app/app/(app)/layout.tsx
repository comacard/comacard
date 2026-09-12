"use client";
import { usePathname } from "next/navigation";
import { type ReactNode, type TouchEvent, useRef, useState } from "react";
import { AuthGate } from "../../components/AuthGate";
import { AccountMenu } from "../../components/desktop/AccountMenu";
import { BottomNav, DesktopNav, SHELL, TopBlur } from "../../components/ui";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useNav } from "../../hooks/useNav";

const SHELL_ROUTES = ["/home", "/earn", "/account"] as const;
type ShellRoute = (typeof SHELL_ROUTES)[number];
type SwipeStart = { x: number; y: number };

export default function AppLayout({ children }: { children: ReactNode }) {
  const nav = useNav();
  const isDesktop = useIsDesktop();
  const pathname = usePathname();
  const swipeStart = useRef<SwipeStart | null>(null);
  const [enterDirection, setEnterDirection] = useState<"next" | "prev">("next");
  const routeIndex = SHELL_ROUTES.indexOf(pathname as ShellRoute);

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isDesktop || routeIndex === -1 || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    swipeStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (isDesktop || routeIndex === -1 || !start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const mostlyHorizontal = Math.abs(dx) > Math.abs(dy) * 1.35;
    const committed = Math.abs(dx) >= 68 && mostlyHorizontal;
    if (!committed) return;

    const nextIndex = dx < 0 ? routeIndex + 1 : routeIndex - 1;
    const nextRoute = SHELL_ROUTES[nextIndex];
    if (!nextRoute) return;

    setEnterDirection(dx < 0 ? "next" : "prev");
    nav.forward(nextRoute);
  };

  return (
    <AuthGate>
      <div
        className="relative min-h-dvh"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          swipeStart.current = null;
        }}
      >
        {/* Mobile-only top blur strip */}
        <div className="lg:hidden">
          <TopBlur />
        </div>

        {/* Desktop-only navigation bar. Full-bleed so its hairline crosses the whole viewport, and
            outside the content column so it can stick to the top of the page rather than to the
            column. AccountMenu is mounted only once the client confirms a desktop viewport, so its
            hooks never run on a phone. */}
        <DesktopNav account={isDesktop ? <AccountMenu /> : undefined} />

        {/* Centered content column. Mobile keeps the exact px-5 pb-[120px] pt-14; desktop swaps the
            padding and drops the bottom-nav gutter. `SHELL` is shared with the navigation bar so the
            brand cannot stop lining up with the first card under it, and it caps the column at
            1200px of content — the width every dashboard measured lands on, and 168px narrower than
            what this ran at before. Centering is mx-auto (never transform — U14). */}
        <div className={`${SHELL} pb-[120px] pt-14 lg:pb-16 lg:pt-8`}>
          <div
            key={pathname}
            className={
              isDesktop
                ? undefined
                : `page-enter ${enterDirection === "prev" ? "page-enter-prev" : ""}`
            }
          >
            {children}
          </div>
        </div>

        {/* Mobile-only bottom nav */}
        <div className="lg:hidden">
          <BottomNav />
        </div>
      </div>
    </AuthGate>
  );
}
