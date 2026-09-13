import { render, screen } from "@testing-library/react";
import { CountUp } from "../CountUp";

/**
 * The figure on screen has to be the figure it was given, from the first paint.
 *
 * It used to start at zero and rely on an effect to walk up to the value. Measured in the dev
 * browser on 13 September 2026 that walk did not complete: the Credit limit rendered "0 tCTC"
 * against a chain reporting 41.4594, and "In your wallet" showed "0 tCTC" and "0 ETH" against a
 * wallet holding 7,998 tCTC. Swapping the component for plain text made the right figure appear
 * immediately, which is what isolated it to here.
 *
 * **These tests could not have caught the original bug**, and that is worth stating rather than
 * pretending otherwise: the component disabled its own animation under `NODE_ENV=test`, so the
 * test environment always saw the correct value while the browser did not. A component that
 * behaves differently under test is a component whose production behaviour is untested. The
 * assertions below are about the mounted value, which is now the same in both.
 */

test("renders the value it was given, not a zero it counts up from", () => {
  render(<CountUp value={41.4594} format={(n) => `${n.toFixed(4)} tCTC`} />);

  expect(screen.getByText("41.4594 tCTC")).toBeInTheDocument();
  expect(screen.queryByText("0.0000 tCTC")).toBeNull();
});

test("a genuine zero is still a zero", () => {
  // The fix must not turn a real zero into something else.
  render(<CountUp value={0} format={(n) => `${n.toFixed(2)} tCTC`} />);
  expect(screen.getByText("0.00 tCTC")).toBeInTheDocument();
});

test("formatting belongs to the caller", () => {
  render(<CountUp value={7998.5} format={(n) => n.toLocaleString("en-US")} />);
  expect(screen.getByText("7,998.5")).toBeInTheDocument();
});

test("a changed value lands on the new figure", () => {
  // Value changes are the case the component exists for: a figure moving because something
  // happened is worth showing as movement, and it still has to end in the right place.
  const { rerender } = render(<CountUp value={10} format={(n) => `${Math.round(n)}`} />);
  expect(screen.getByText("10")).toBeInTheDocument();

  rerender(<CountUp value={42} format={(n) => `${Math.round(n)}`} />);
  expect(screen.getByText("42")).toBeInTheDocument();
});
