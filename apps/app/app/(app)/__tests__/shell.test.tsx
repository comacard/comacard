import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import AppLayout from "../layout";

const push = vi.fn();
let pathname = "/home";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
vi.mock("../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));

beforeEach(() => {
  pathname = "/home";
  push.mockClear();
  useWallet.mockReset();
});

test("renders nav + children when connected", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(
    <AppLayout>
      <p>home body</p>
    </AppLayout>,
  );
  expect(screen.getByText("home body")).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
});

test("redirects to / when not connected", () => {
  useWallet.mockReturnValue({ isConnected: false, hydrated: true });
  render(
    <AppLayout>
      <p>home body</p>
    </AppLayout>,
  );
  expect(push).toHaveBeenCalledWith("/");
});

test("desktop chrome present: the desktop nav renders alongside the mobile bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(
    <AppLayout>
      <p>home body</p>
    </AppLayout>,
  );
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument(); // mobile BottomNav kept
  expect(screen.getByText("Comacard")).toBeInTheDocument(); // desktop brand

  // The bar is the point: before it, desktop chrome was a wordmark and an avatar, and Credit had no
  // way to be reached at all. Both are landmarks in the DOM at once and CSS picks one per viewport.
  const desktop = screen.getByRole("navigation", { name: "Primary" });
  expect(desktop).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/home");
  expect(screen.getByRole("link", { name: "Credit" })).toHaveAttribute("href", "/earn");
  // Activity is a drawer on desktop by design, so the link addresses the drawer's own URL rather
  // than /transactions, which the (flow) layout would bounce straight back to /home.
  expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
    "href",
    "/home?panel=activity",
  );
});

test("the desktop nav marks the current route, and only it", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  pathname = "/earn";
  render(
    <AppLayout>
      <p>credit body</p>
    </AppLayout>,
  );
  expect(screen.getByRole("link", { name: "Credit" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
});

test("mobile shell swipe moves between the three tab routes", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  const { container, rerender } = render(
    <AppLayout>
      <p>home body</p>
    </AppLayout>,
  );
  const shell = container.firstElementChild as HTMLElement;

  fireEvent.touchStart(shell, { touches: [{ clientX: 320, clientY: 240 }] });
  fireEvent.touchEnd(shell, { changedTouches: [{ clientX: 180, clientY: 246 }] });
  expect(push).toHaveBeenCalledWith("/earn");

  pathname = "/earn";
  rerender(
    <AppLayout>
      <p>earn body</p>
    </AppLayout>,
  );
  fireEvent.touchStart(shell, { touches: [{ clientX: 120, clientY: 240 }] });
  fireEvent.touchEnd(shell, { changedTouches: [{ clientX: 260, clientY: 244 }] });
  expect(push).toHaveBeenCalledWith("/home");
});
