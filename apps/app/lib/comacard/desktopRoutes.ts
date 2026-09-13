/**
 * What desktop does with each `(flow)` route: render it, or send it to a drawer.
 *
 * **A route in neither list silently vanishes.** `FlowLayout` falls through to
 * `router.replace("/home")`, so the screen never renders, nothing throws, and the button that led
 * there looks like it did not register. That has now happened twice: `/pay` was missing, so a
 * desktop cardholder could not perform the repayment that closes a cycle, which is the entire
 * product; and `/withdraw/[sym]` was missing, so the Sepolia withdraw screen was unreachable on the
 * day it shipped.
 *
 * It lives here rather than inside `layout.tsx` so it can be tested as a function. The previous
 * test rendered the layout with one mocked pathname, which is a list of several checked with a
 * single example, and that is the failure shape the root CLAUDE.md is about.
 */

/** Rendered in place at desktop width, inside the flow column. */
export function rendersOnDesktop(path: string): boolean {
  return (
    // Addressed by asset id. The deposit drawer cannot show one specific cross-chain asset, and
    // sending it to `?panel=deposit` returned the visitor to the drawer the link was clicked in.
    path.startsWith("/deposit/x/") ||
    // Every withdraw screen: `/withdraw/x/[id]` for the Wormhole chains, `/withdraw/[sym]` for
    // Sepolia. The second was added and this list was not.
    path.startsWith("/withdraw/") ||
    // Send is a picker rather than a keypad and has no desktop drawer to redirect to.
    path === "/send" ||
    path.startsWith("/send/") ||
    // Repay. Same reason: there is no drawer for it, and it is the action the credit line exists
    // for, so bouncing it to Home made the product unusable on desktop rather than merely awkward.
    path === "/pay"
  );
}

/** Routes whose desktop equivalent is a panel on Home. */
export const PANEL_ROUTES: { match: (path: string) => boolean; to: string }[] = [
  {
    match: (p) => p === "/add-funds" || p === "/deposit" || p.startsWith("/deposit/"),
    to: "/home?panel=deposit",
  },
  { match: (p) => p === "/transactions", to: "/home?panel=activity" },
];

/**
 * Where a desktop visitor on `path` should end up, or null to render in place.
 *
 * One function so a caller cannot consult one list and forget the other, which is how `/pay` ended
 * up falling through a `?? "/home"` that was written as a safety net and behaved as a trapdoor.
 */
export function desktopTarget(path: string): string | null {
  if (rendersOnDesktop(path)) return null;
  return PANEL_ROUTES.find((r) => r.match(path))?.to ?? "/home";
}
