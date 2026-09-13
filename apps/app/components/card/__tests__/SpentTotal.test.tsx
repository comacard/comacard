import { render, screen } from "@testing-library/react";
import { SpentTotal } from "../SpentTotal";

/**
 * The one row on Home that answers "do I still owe anything".
 *
 * It used to answer a different question: lifetime spend, summed from `Draw` events with
 * repayments never netted off, and rendered only when nothing was owed. So a card with a balance
 * showed no row at all, and a card that had just been paid off showed "13 tCTC", which reads as
 * still outstanding. These tests pin the inversion closed.
 */

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

test("shows what is still owed", () => {
  creditLine.mockReturnValue({ drawn: 13n * 10n ** 18n, loading: false });
  render(<SpentTotal />);

  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("13 tCTC")).toBeInTheDocument();
});

test("goes to zero once the card is settled, and says so out loud", () => {
  // The complaint this fixes: repaid in full, and the row still read 13.
  creditLine.mockReturnValue({ drawn: 0n, loading: false });
  render(<SpentTotal />);

  expect(screen.getByText("0 tCTC")).toBeInTheDocument();
});

test("is rendered whether or not anything is owed", () => {
  // Previously `{owes ? null : <SpentTotal />}` on Home, which hid the row in exactly the state
  // where a person most wants to see it.
  creditLine.mockReturnValue({ drawn: 5n * 10n ** 18n, loading: false });
  const { container } = render(<SpentTotal />);
  expect(container).not.toBeEmptyDOMElement();

  creditLine.mockReturnValue({ drawn: 0n, loading: false });
  const settled = render(<SpentTotal />);
  expect(settled.container).not.toBeEmptyDOMElement();
});

test("withholds the row until the read lands, because an unread figure is not a zero", () => {
  // `accountOf` on the Creditcoin RPC takes about four seconds. Printing "0 tCTC" for that window
  // is a claim that the card is settled, made by a screen that has not asked yet.
  creditLine.mockReturnValue({ drawn: undefined, loading: true });
  const { container } = render(<SpentTotal />);

  expect(container).toBeEmptyDOMElement();
});

test("withholds the row when the read failed rather than reporting nothing owed", () => {
  creditLine.mockReturnValue({ drawn: undefined, loading: false });
  const { container } = render(<SpentTotal />);

  expect(container).toBeEmptyDOMElement();
});

test("an open balance is marked, a settled one is not", () => {
  // Colour carries the state as well as the figure, so the row reads at a glance rather than
  // needing the number to be parsed.
  creditLine.mockReturnValue({ drawn: 13n * 10n ** 18n, loading: false });
  const owing = render(<SpentTotal />);
  expect(owing.getByText("13 tCTC").className).toContain("text-neg");

  creditLine.mockReturnValue({ drawn: 0n, loading: false });
  const settled = render(<SpentTotal />);
  expect(settled.getByText("0 tCTC").className).not.toContain("text-neg");
});
