import { desktopTarget, PANEL_ROUTES, rendersOnDesktop } from "../desktopRoutes";

/**
 * Every `(flow)` route, against the decision that says what desktop does with it.
 *
 * A path that is neither rendered nor redirected falls through to `/home`: the screen never
 * appears, nothing throws, and the button that led there looks like it did not register. That
 * shipped twice. `/pay` was missing, so desktop could not perform the repayment that closes a
 * cycle, which is the whole product. `/withdraw/[sym]` was missing, so the Sepolia withdraw screen
 * was unreachable the day it was written.
 *
 * Tested as a function rather than by rendering the layout once per path. The previous version
 * mocked a single pathname, which is a list of several checked with one example, and a first
 * attempt at fixing that with `vi.resetModules()` inside the test leaked into other files and made
 * the suite fail on one run and pass on the next.
 */

/** Read off disk: every `page.tsx` under `app/(flow)`, with params filled in. */
const FLOW_ROUTES = {
  "/add-funds": "/home?panel=deposit",
  "/deposit": "/home?panel=deposit",
  "/deposit/eth": "/home?panel=deposit",
  // Addressed by asset id. The drawer cannot show one specific cross-chain asset, and sending it to
  // `?panel=deposit` returned the visitor to the drawer the link was clicked in.
  "/deposit/x/0xabc": null,
  "/pay": null,
  "/send": null,
  "/send/me": null,
  "/send/to": null,
  "/transactions": "/home?panel=activity",
  "/withdraw/tusdc": null,
  "/withdraw/x/0xabc": null,
} as const;

test.each(Object.entries(FLOW_ROUTES))(
  "%s resolves to its stated destination",
  (path, expected) => {
    expect(desktopTarget(path)).toBe(expected);
  },
);

test("nothing falls through to Home by accident", () => {
  // The `?? "/home"` in `desktopTarget` is a safety net for a typed URL. It became a trapdoor for
  // two real screens, so every known route must resolve by a rule rather than by that default.
  for (const [path, expected] of Object.entries(FLOW_ROUTES)) {
    if (expected === null) continue;
    expect(
      PANEL_ROUTES.some((r) => r.match(path)),
      path,
    ).toBe(true);
  }
});

test("repay and both withdraw screens render at desktop width", () => {
  // The two that were missing, named so a future edit to the predicate has to confront them.
  expect(rendersOnDesktop("/pay")).toBe(true);
  expect(rendersOnDesktop("/withdraw/tusdc")).toBe(true);
  expect(rendersOnDesktop("/withdraw/x/0xabc")).toBe(true);
});

test("an unknown path still lands somewhere rather than rendering nothing", () => {
  expect(desktopTarget("/nonsense")).toBe("/home");
});
