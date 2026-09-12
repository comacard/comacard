import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { BottomNav } from "../BottomNav";

vi.mock("next/navigation", () => ({ usePathname: () => "/earn" }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));

test("marks the active tab by pathname", () => {
  render(<BottomNav />);
  expect(screen.getByRole("link", { name: /Credit/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /Home/ })).not.toHaveAttribute("aria-current");
});
