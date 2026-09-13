import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SlidingTabs, TabPanel } from "../SlidingTabs";

/**
 * GSAP animates real geometry, and jsdom has none: every element measures zero.
 *
 * So these do not assert on the tween. They assert on the things that must hold whether or not the
 * animation runs, which are the ones that break a screen: the tabs still switch, the selection is
 * still announced, and a panel that unmounts mid-tween does not leave the next one invisible.
 */

const OPTIONS = [
  { key: "all", label: "All" },
  { key: "card", label: "Card" },
  { key: "deposit", label: "Deposit" },
] as const;

test("switching a tab reports the new selection", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<SlidingTabs options={OPTIONS} value="all" onChange={onChange} label="Filter" />);

  await user.click(screen.getByRole("button", { name: "Card" }));

  expect(onChange).toHaveBeenCalledWith("card");
});

test("the selected tab is the pressed one, for anyone who cannot see the highlight", () => {
  render(<SlidingTabs options={OPTIONS} value="card" onChange={vi.fn()} label="Filter" />);

  // The highlight is a decorative div, so `aria-pressed` is the only thing carrying the state.
  expect(screen.getByRole("button", { name: "Card" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
});

test("the group is named", () => {
  render(
    <SlidingTabs options={OPTIONS} value="all" onChange={vi.fn()} label="Filter transactions" />,
  );

  expect(screen.getByRole("group", { name: "Filter transactions" })).toBeInTheDocument();
});

test("a panel torn down mid-change leaves its replacement visible", () => {
  // The classic failure: the cleanup kills a tween that had the element at opacity 0, and the next
  // render inherits it. The list disappears and never comes back.
  const { rerender } = render(
    <TabPanel key="all">
      <p>first</p>
    </TabPanel>,
  );

  rerender(
    <TabPanel key="card">
      <p>second</p>
    </TabPanel>,
  );

  const panel = screen.getByText("second").parentElement;
  expect(panel).not.toBeNull();
  expect(panel?.style.opacity === "" || Number(panel?.style.opacity) > 0).toBe(true);
});

test("a panel renders its children", () => {
  render(
    <TabPanel key="all">
      <p>rows go here</p>
    </TabPanel>,
  );

  expect(screen.getByText("rows go here")).toBeInTheDocument();
});
