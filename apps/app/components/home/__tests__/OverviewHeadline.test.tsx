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
  expect(screen.getByText("Limit")).toBeInTheDocument();
  expect(screen.getByText("41 tCTC")).toBeInTheDocument();
  // The label is "Score" now, a tile heading rather than a word inside a sentence.
  expect(screen.getByText("Score").parentElement).toHaveTextContent("42");
});

test("flips to the balance the moment a cycle is open", () => {
  render(<OverviewHeadline spendable="23" limit={41n * ONE} drawn={13n * ONE} score={42n} />);

  // Brex leads with what you owe when the next statement is due; Mercury leads with Total Balance
  // and demotes availability to a small line. Availability moves to the sub-line here for the same
  // reason: it is no longer the figure the next action depends on.
  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("13 tCTC")).toBeInTheDocument();
  expect(screen.getByText("Still to spend")).toBeInTheDocument();
  expect(screen.getByText("23 tCTC")).toBeInTheDocument();
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

test("the pair under the figure flips with the figure, and Limit is not shown inside a cycle", () => {
  // The two tiles replaced a caption that read "23 tCTC still available · repay in full to close
  // this cycle". Axel chose to drop it. Worth recording what went with it: that sentence was the
  // only place on Overview stating that a partial payment settles debt and earns no mark, and that
  // fact now lives only on Credit, where `CycleList` marks a short cycle "No mark".
  render(<OverviewHeadline spendable="23" limit={41n * ONE} drawn={13n * ONE} score={42n} />);

  expect(screen.getByText("Still to spend")).toBeInTheDocument();
  expect(screen.queryByText("Limit")).toBeNull();
});

test("an unread figure is a dash, never a zero", () => {
  render(<OverviewHeadline spendable={undefined} limit={undefined} drawn={0n} score={undefined} />);

  // The Creditcoin RPC takes about four seconds a call. "0 tCTC" for that window is a claim that
  // the card is empty, made by a screen that has not finished asking. All three figures are unread
  // here, the headline and both tiles, and every one of them has to be a dash rather than a zero.
  expect(screen.getAllByText("—")).toHaveLength(3);
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
