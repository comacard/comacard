"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SHELL } from "./shell";

/**
 * The desktop navigation bar.
 *
 * It replaces `TopBar`, which carried a wordmark and an avatar and nothing between them. That was
 * not a stylistic gap: desktop folds Earn and Account into `/home` (see `useRedirectDesktopToHome`
 * and the `(flow)` layout), so with no links in the chrome a desktop user had **no way to reach any
 * screen other than Overview** except through the avatar dropdown. The bar is what makes the second
 * destination exist.
 *
 * Measured off Stripe's own header at 1440px rather than guessed: 28px between the brand and the
 * nav group, 14px nav labels, a centred container that stops short of the viewport edge, and a row
 * tall enough (64px here, 76px there) that the links are not crowding the fold. What is *not*
 * borrowed is the item treatment — Stripe underlines, this app has spoken in pills since the mobile
 * bottom nav, and the product's own vocabulary beats the reference's.
 *
 * Activity is a `?panel=` link, not a route, because `/transactions` has no desktop page by design —
 * the `(flow)` group redirects desktop visitors to the matching drawer. Pointing the link straight
 * at the drawer's own URL keeps one source of truth for that state and leaves Back working.
 *
 * Mobile never renders this: the layout gates it behind `hidden lg:block`, and mobile keeps its
 * bottom nav untouched.
 */

const LINKS = [
  { href: "/home", label: "Overview" },
  // The route stays `/earn` — the bottom nav, the swipe order and the tests all address that path.
  // Only what it shows, and what it is called, became Credit.
  { href: "/earn", label: "Credit" },
] as const;

function Item({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-9 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors ${
        active
          ? "border border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_8px_18px_-12px_rgba(17,19,22,.26)]"
          : "border border-transparent text-muted hover:bg-pill hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function DesktopNav({ account }: { account?: ReactNode }) {
  const path = usePathname();

  // `hidden lg:block` sits on the header itself rather than on a wrapper, and that is load-bearing:
  // `position: sticky` only sticks inside its own parent's box, so a wrapper collapsed to the bar's
  // own height would pin it to nothing and it would scroll away like a static element.
  return (
    <header className="sticky top-0 z-50 hidden border-b border-line bg-bg/80 [backdrop-filter:saturate(1.4)_blur(12px)] lg:block">
      {/* Same container as the content column below, so the brand lines up with the first card. */}
      <div className={`${SHELL} flex h-16 items-center gap-4`}>
        <Link href="/home" className="inline-flex shrink-0 items-center gap-[9px]">
          <Image
            src="/brand/comacard-logo.png"
            alt=""
            width={1024}
            height={1024}
            className="h-[28px] w-[28px] rounded-[9px]"
            priority
          />
          <span className="text-[17px] font-bold tracking-[-0.02em]">Comacard</span>
        </Link>

        {/* "Primary" rather than "Main": the mobile bottom nav already owns that name, and
            although the two are mutually exclusive by viewport — `display:none` takes the other
            out of the accessibility tree entirely — two landmarks sharing a name is ambiguous
            anywhere CSS is not applied, the test renderer included. */}
        {/* A hairline between the mark and the links. Without it the active pill sits 28px from the
            wordmark and the two read as one blob — the brand appearing to have a tab attached. */}
        <span aria-hidden className="h-5 w-px shrink-0 bg-line-2" />

        <nav aria-label="Primary" className="flex items-center gap-1">
          {LINKS.map((link) => (
            <Item key={link.href} href={link.href} active={path === link.href}>
              {link.label}
            </Item>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <Item href="/home?panel=activity" active={false}>
            Activity
          </Item>
          {account}
        </div>
      </div>
    </header>
  );
}
