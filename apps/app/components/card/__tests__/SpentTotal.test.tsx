import { render, screen } from "@testing-library/react";
import { SpentTotal } from "../SpentTotal";

/**
 * What has come out of the card, counted from `Draw` events.
 *
 * Two things are pinned. It must never read the wallet, because a wallet holds tCTC from faucets
 * and from everything else the holder does on Creditcoin, and presenting that as spending would
 * make an unused card look heavily used. And zero must be stated rather than hidden: without it the
 * only tCTC figure on Home is the collateral's value, which is a different number entirely.
 */

const history = vi.fn();
vi.mock("../../../hooks/useCreditHistory", () => ({ useCreditHistory: () => history() }));

beforeEach(() => {
  vi.clearAllMocks();
  history.mockReturnValue({
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    events: [],
    loading: false,
    error: false,
  });
});

test("states zero rather than hiding the row", () => {
  render(<SpentTotal />);

  // Hidden, the only tCTC on the screen is "50.0000 tCTC" under the collateral — which is what the
  // collateral is worth, not what was spent. The zero is what tells them apart.
  expect(screen.getByText("Spent from your card")).toBeInTheDocument();
  expect(screen.getByText("0 tCTC")).toBeInTheDocument();
});

test("sums what the credit line paid out", () => {
  history.mockReturnValue({
    borrowed: 1_500_000_000_000_000_000n,
    repaid: 0n,
    cyclesClosed: 0,
    events: [],
    loading: false,
    error: false,
  });
  render(<SpentTotal />);

  expect(screen.getByText("1.5 tCTC")).toBeInTheDocument();
});

test("does not net repayments off: this is what was taken, not what is owed", () => {
  history.mockReturnValue({
    borrowed: 1_000_000_000_000_000_000n,
    repaid: 1_000_000_000_000_000_000n,
    cyclesClosed: 1,
    events: [],
    loading: false,
    error: false,
  });
  render(<SpentTotal />);

  // Fully repaid, and still 1 tCTC was spent. The balance owed is a separate row answering a
  // separate question.
  expect(screen.getByText("1 tCTC")).toBeInTheDocument();
});

test("withholds the row when the indexer could not be read", () => {
  history.mockReturnValue({
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    events: [],
    loading: false,
    error: true,
  });
  const { container } = render(<SpentTotal />);

  // The zero this row exists to state is one the indexer returned. A zero produced by failing to
  // reach it is a different thing entirely: it showed "Spent from your card 0 tCTC" next to a
  // 1 tCTC balance read live off the chain, and both cannot be true.
  expect(container).toBeEmptyDOMElement();
});

test("withholds the row until the first read lands", () => {
  history.mockReturnValue({
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    events: [],
    loading: true,
    error: false,
  });
  const { container } = render(<SpentTotal />);

  // An unresolved query is not a zero, and printing one would state something not yet known.
  expect(container).toBeEmptyDOMElement();
});
