import path from "node:path";
import { expect, type Page } from "@playwright/test";

const EVIDENCE_DIR = path.join("..", "docs", "tests", "linear-STE-44", "screenshots");

/** Capture PR evidence. Opt-in via `E2E_EVIDENCE=1`, so an ordinary run leaves the tree clean. */
export async function shot(page: Page, name: string): Promise<void> {
  if (process.env.E2E_EVIDENCE !== "1") return;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `${name}.png`) });
}

/** Land in the app with a stubbed wallet connected. The stub signs without a popup. */
export async function connectWallet(page: Page): Promise<void> {
  await page.goto("/");
  // With a session already stored, the landing auto-forwards to /home (STE-43) before the button
  // ever renders: that path is itself proof the fix works. Only click when onboarding is actually
  // shown. `goto` resolves on HTML load, well before hydration flips the landing past its `null`
  // SSR shell, so a one-shot `isVisible()` right after `goto` reads false even when the button is
  // about to appear (no stored session, the common case): race whichever settles first instead.
  const connect = page.getByRole("button", { name: "Connect wallet" });
  const showsButton = await Promise.race([
    connect.waitFor({ state: "visible" }).then(() => true),
    page
      .getByRole("button", { name: "Skip" })
      .waitFor({ state: "visible" })
      .then(() => false),
    page.waitForURL(/\/home$/).then(() => false),
  ]).catch(() => false);

  if (!showsButton && !/\/home$/.test(page.url())) {
    const skip = page.getByRole("button", { name: "Skip" });
    if (await skip.isVisible()) {
      await skip.click();
    }
  }

  if (showsButton) {
    await connect.click();
  } else if (!/\/home$/.test(page.url())) {
    await expect(connect).toBeVisible();
    await connect.click();
  }
  await expect(page).toHaveURL(/\/home$/);
}

/**
 * Assert the desktop Overview chrome is on screen and the mobile bottom nav is hidden.
 *
 * **This asserted the old dashboard until now**, and would have failed the moment it ran: headings
 * "Buckets", "Growth" and "Agent", plus a "your value" hero eyebrow, none of which have existed
 * since the #9 conversion. `DesktopOverview.test.tsx` asserts the opposite in the same
 * repo, so the two suites contradicted each other and the contradiction went unnoticed because the
 * Playwright specs are not in the vitest run.
 *
 * What it checks now is chrome rather than content: the brand, the nav, the primary action, and
 * that the mobile bar is hidden. Figures belong in the unit tests, which can mock a wallet; an e2e
 * that asserts an amount is asserting whatever the shared chain state happens to hold.
 */
export async function expectDesktopHome(page: Page): Promise<void> {
  await expect(page.getByText("Comacard")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Deposit" })).toBeVisible();
  // CSS-hidden at lg rather than unmounted, so `toBeHidden` is the right assertion.
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  // Nothing from the product this was ported from should survive on this screen.
  await expect(page.getByText(/\b(bucket|APY|sentinel)\b/i)).toHaveCount(0);
}

/**
 * Desktop deposit: the hero "Deposit" opens a right drawer (role=dialog "Deposit"), not a route.
 * Pick the coin inside the drawer, fill the <input> (not the numpad), Deposit → the one-time consent
 * Dialog → success stays in the drawer until the final action. Caller must already be on desktop
 * /home.
 */
export async function depositViaDrawer(
  page: Page,
  coin: "tUSDC" | "tUSDT" | "ETH",
  amount: string,
): Promise<void> {
  await page.getByRole("button", { name: "Deposit" }).click();
  const drawer = page.getByRole("dialog", { name: "Deposit" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("button", { name: new RegExp(`^${coin}`) }).click();
  await expect(drawer.getByText(`Deposit ${coin}`)).toBeVisible();
  await drawer.getByLabel("Amount").fill(amount);
  await drawer.getByRole("button", { name: "Deposit" }).click();
  const consent = page.getByRole("dialog", { name: "Approve automatic earning" });
  await expect(consent).toBeVisible();
  await consent.getByRole("button", { name: "Agree & sign" }).click();
  await expect(drawer.getByText("Deposit Success")).toBeVisible();
  await drawer.getByRole("button", { name: "Back to Home" }).click();
  await expect(drawer).toBeHidden();
}
