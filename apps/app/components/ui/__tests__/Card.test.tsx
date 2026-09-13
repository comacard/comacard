import { render, screen } from "@testing-library/react";
import { Card } from "../Card";

test("renders children inside a card", () => {
  render(<Card>hello</Card>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});

test("a caller's className wins over the component's own", () => {
  // Tailwind emits utilities in its own order, not class-attribute order: in the built sheet
  // `.mt-0` lands at line 744 and `.mt-4` at 772, so `class="mt-4 mt-0"` resolves to mt-4 and the
  // caller's override loses silently. `cn()` resolves the conflict before it reaches the DOM.
  // `CollateralList` had to use a default parameter rather than concatenation to work around this.
  const { container } = render(<Card className="rounded-none bg-white" />);
  const el = container.firstElementChild as HTMLElement;

  expect(el.className).toContain("rounded-none");
  expect(el.className).not.toContain("rounded-card");
});

test("a className that does not conflict is simply added", () => {
  const { container } = render(<Card className="mb-6" />);
  const el = container.firstElementChild as HTMLElement;

  expect(el.className).toContain("mb-6");
  expect(el.className).toContain("bg-card");
});
