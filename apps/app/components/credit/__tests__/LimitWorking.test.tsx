import { render, screen } from "@testing-library/react";
import { LimitWorking } from "../LimitWorking";

/**
 * Three rows that have to multiply through, on the screen whose subject is how a limit is earned.
 *
 * The limit was a figure with no working shown, on a product whose entire pitch is that the figure
 * moves in response to what the holder does.
 */

const ONE = 10n ** 18n;

test("the two inputs are shown, and the percentage is derived from what is on screen", () => {
  render(
    <LimitWorking collateralValue={50n * ONE} limit={41_459_369_817_578_772_802n} score={42n} />,
  );

  expect(screen.getByText("50 tCTC")).toBeInTheDocument();
  expect(screen.getByText("At score 42")).toBeInTheDocument();
  // The result is the headline directly above this block, not a third row repeating it.
  expect(screen.queryByText("41.4594 tCTC")).toBeNull();

  // 41.4594 / 50. Taken from the two figures on screen rather than from `borrowableBps`, whose
  // integer division truncates 8291.87 to 8291 and would render 82.91% beside an arithmetic that
  // actually resolves to 82.92, failing to multiply through by about 0.004 tCTC.
  expect(screen.getByText("82.92%")).toBeInTheDocument();
});

test("a missing figure renders nothing rather than a partial sum", () => {
  // Two of three rows invite the reader to complete the third themselves, wrongly. Worse than
  // showing nothing, on a screen that exists to explain an arithmetic.
  const { container } = render(
    <LimitWorking collateralValue={50n * ONE} limit={undefined} score={42n} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test("an unread collateral value renders nothing", () => {
  const { container } = render(
    <LimitWorking collateralValue={null} limit={41n * ONE} score={42n} />,
  );
  expect(container).toBeEmptyDOMElement();
});

test("with no collateral it falls back to the ratio the score buys", () => {
  // Nothing to divide by, so the share comes from the score alone rather than from 0/0.
  render(<LimitWorking collateralValue={0n} limit={0n} score={42n} />);

  expect(screen.getByText("82.91%")).toBeInTheDocument();
  expect(screen.getByText("0 tCTC")).toBeInTheDocument();
});

test("a fresh account sees the ratio a zero score buys", () => {
  // 150% required collateralisation at score 0, so two thirds of what is held.
  render(<LimitWorking collateralValue={0n} limit={0n} score={0n} />);
  expect(screen.getByText("66.66%")).toBeInTheDocument();
});
