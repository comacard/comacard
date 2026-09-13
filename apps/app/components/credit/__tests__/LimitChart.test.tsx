import { render, screen } from "@testing-library/react";
import { LimitChart } from "../LimitChart";

/**
 * The limit's own history, on the screen that exists to prove it was earned.
 *
 * Two things are pinned here, and both are about not overclaiming. A chart cannot show a trend from
 * one point, and a chart must not wear the colour of success while its figures fall.
 */

const ONE = 10n ** 18n;
const point = (limit: bigint, at: number) => ({
  id: `p${at}`,
  limit,
  available: limit,
  score: 42n,
  at,
  txHash: `0x${at}`,
});

test("one point draws nothing: a fact is not a trend", () => {
  const { container } = render(<LimitChart points={[point(33n * ONE, 1_700_000_000)]} />);
  expect(container).toBeEmptyDOMElement();
});

test("two points draw a series, and both ends are named", () => {
  render(
    <LimitChart points={[point(33n * ONE, 1_700_000_000), point(46n * ONE, 1_700_090_000)]} />,
  );
  // A chart with no figures against it is decoration; these are what make it checkable.
  expect(screen.getByText("33 tCTC")).toBeInTheDocument();
  expect(screen.getByText("46 tCTC")).toBeInTheDocument();
});

test("it steps rather than slopes, because a limit does not drift between events", () => {
  // A straight line between two events draws every value in between, and the account held none of
  // them. The horizontal run is the truth and the vertical jump is the event.
  const { container } = render(
    <LimitChart points={[point(10n * ONE, 1_700_000_000), point(20n * ONE, 1_700_090_000)]} />,
  );
  // The line, not the area fill under it: both are paths and only one is stroked.
  const d = container.querySelector('path[fill="none"]')?.getAttribute("d") ?? "";
  // Same x twice in a row is the vertical jump: the step, rather than a diagonal.
  const xs = [...d.matchAll(/L (\d+(?:\.\d+)?) /g)].map((m) => m[1]);
  expect(new Set(xs).size).toBeLessThan(xs.length);
});

test("the accent is green only when the limit actually rose", () => {
  const { container, rerender } = render(
    <LimitChart points={[point(10n * ONE, 1_700_000_000), point(40n * ONE, 1_700_090_000)]} />,
  );
  expect(container.querySelector('path[fill="none"]')?.getAttribute("stroke")).toBe(
    "var(--color-pos)",
  );

  // Falling is not a fault: the holder took their collateral back and the product let them. Green
  // would claim a success the figures deny, and red would claim a failure that did not happen.
  rerender(
    <LimitChart points={[point(40n * ONE, 1_700_000_000), point(10n * ONE, 1_700_090_000)]} />,
  );
  expect(container.querySelector('path[fill="none"]')?.getAttribute("stroke")).toBe(
    "var(--color-muted)",
  );
});

test("a flat series does not divide by zero", () => {
  // Two `refreshScore` re-emissions with the same value reach here if `changed` ever lets them.
  render(
    <LimitChart points={[point(10n * ONE, 1_700_000_000), point(10n * ONE, 1_700_090_000)]} />,
  );
  expect(screen.getAllByText("10 tCTC")).toHaveLength(2);
});
