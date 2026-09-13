import { render, screen } from "@testing-library/react";
import { OverviewHeadline } from "../OverviewHeadline";

/**
 * One figure, and which one it is depends on whether a cycle is open.
 *
 * The rule every credit product in the survey follows: lead with the number the next action
 * depends on. Most days that is spending power; inside an open cycle it is the repayment.
 */

const ONE = 10n ** 18n;

test("leads with spending power when nothing is owed", () => {
  render(<OverviewHeadline spendable="36" limit={41n * ONE} drawn={0n} score={42n} />);

  expect(screen.getByText("Available to spend")).toBeInTheDocument();
  expect(screen.getByText("36 tCTC")).toBeInTheDocument();
  expect(screen.getByText(/of 41 tCTC limit/)).toBeInTheDocument();
  expect(screen.getByText(/score/)).toHaveTextContent("42");
});

test("flips to the balance the moment a cycle is open", () => {
  render(<OverviewHeadline spendable="23" limit={41n * ONE} drawn={13n * ONE} score={42n} />);

  // Brex leads with what you owe when the next statement is due; Mercury leads with Total Balance
  // and demotes availability to a small line. Availability moves to the sub-line here for the same
  // reason: it is no longer the figure the next action depends on.
  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("13 tCTC")).toBeInTheDocument();
  expect(screen.getByText(/23 tCTC still available/)).toBeInTheDocument();
  expect(screen.queryByText("Available to spend")).toBeNull();
});

test("an open balance is marked, so the word does not carry the meaning alone", () => {
  // "Balance" does not say which direction it points, on a product that is both debit and credit.
  // That is the ambiguity that made Amex name three separate balances. Tone compensates.
  const { rerender } = render(
    <OverviewHeadline spendable="23" limit={41n * ONE} drawn={13n * ONE} score={42n} />,
  );
  expect(screen.getByText("13 tCTC").className).toContain("text-neg");

  rerender(<OverviewHeadline spendable="36" limit={41n * ONE} drawn={0n} score={42n} />);
  expect(screen.getByText("36 tCTC").className).not.toContain("text-neg");
});

test("the sub-line says what closes a cycle rather than repeating the figure", () => {
  render(<OverviewHeadline spendable="23" limit={41n * ONE} drawn={13n * ONE} score={42n} />);

  // Only a payment that clears the balance to zero closes a cycle and moves the score. A partial
  // one settles debt and earns nothing, and nothing else on this screen says so.
  expect(screen.getByText(/repay in full to close this cycle/)).toBeInTheDocument();
});

test("an unread figure is a dash, never a zero", () => {
  render(<OverviewHeadline spendable={undefined} limit={undefined} drawn={0n} score={undefined} />);

  // The Creditcoin RPC takes about four seconds a call. "0 tCTC" for that window is a claim that
  // the card is empty, made by a screen that has not finished asking.
  expect(screen.getByText("—")).toBeInTheDocument();
  expect(screen.queryByText("0 tCTC")).toBeNull();
});

test("an unissued card leads with that, not with a figure", () => {
  render(<OverviewHeadline spendable="0" limit={0n} drawn={0n} score={0n} unissued />);

  expect(screen.getByText("Not issued yet")).toBeInTheDocument();
  expect(screen.queryByText(/tCTC/)).toBeNull();
});

test("loading reserves the shape rather than collapsing", () => {
  const { container } = render(
    <OverviewHeadline
      spendable={undefined}
      limit={undefined}
      drawn={undefined}
      score={undefined}
      loading
    />,
  );

  // Three skeletons in the shape of label, figure and sub-line, so nothing below shifts when the
  // reads land.
  expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  expect(container.textContent).toBe("");
});

test("the headline figure is the API's spendable, not availableOf on the line", () => {
  // `spendable` is the minimum of available credit and whatever else gates the card. Leading with
  // `availableOf` would promise credit the card then refuses, which is why `CardHero` has read it
  // from the same place since it was written. Given deliberately divergent values here.
  render(<OverviewHeadline spendable="10" limit={41n * ONE} drawn={0n} score={42n} />);

  expect(screen.getByText("10 tCTC")).toBeInTheDocument();
  expect(screen.queryByText("999 tCTC")).toBeNull();
});
