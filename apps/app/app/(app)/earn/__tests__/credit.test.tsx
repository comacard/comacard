import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CreditEvent } from "../../../../hooks/useCreditHistory";
import EarnPage from "../page";

/**
 * The middle tab after it stopped reporting APY it never paid.
 *
 * Two things are worth pinning. The headline has to be the score, because the score is the only
 * figure a holder can move and the whole product is that moving it buys more credit per unit of
 * collateral. And an empty record has to look empty: this is the one screen whose subject is a
 * truthful history, so filling the chart with an example would undo it.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));
vi.mock("../../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));

const creditLine = vi.fn();
vi.mock("../../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

const history = vi.fn();
vi.mock("../../../../hooks/useCreditHistory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCreditHistory: () => history(),
}));

const event = (over: Partial<CreditEvent> = {}): CreditEvent => ({
  id: "1",
  kind: "borrow",
  amount: 240_000_000_000_000_000n,
  at: Math.floor(Date.now() / 1000) - 3600,
  txHash: "0xabc",
  settled: false,
  ...over,
});

function empty() {
  return { events: [], borrowed: 0n, repaid: 0n, cyclesClosed: 0, loading: false, error: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  creditLine.mockReturnValue({ score: 42n, limit: 497_512_437_810_945_273n, drawn: 0n });
  history.mockReturnValue(empty());
});

test("leads with the limit, not with a yield", () => {
  render(<EarnPage />);

  // The score was the headline first and read as a fault: it sits at zero straight after a deposit
  // that plainly worked, because a deposit buys a limit and only repaying earns a score.
  expect(screen.getByText("Your limit")).toBeInTheDocument();
  expect(screen.queryByText(/APY|yield|bucket/i)).toBeNull();
});

test("an empty record renders empty", () => {
  render(<EarnPage />);

  expect(screen.getByText("Nothing spent yet")).toBeInTheDocument();
  // No bars at all rather than a flat row of stubs, which reads as broken.
  expect(screen.queryByTestId("bars")).toBeNull();
});

test("a real record draws the bars and totals what happened", () => {
  history.mockReturnValue({
    events: [event(), event({ id: "2", kind: "repay", settled: true })],
    borrowed: 240_000_000_000_000_000n,
    repaid: 240_000_000_000_000_000n,
    cyclesClosed: 1,
    loading: false,
    error: false,
  });
  render(<EarnPage />);

  expect(screen.getByTestId("bars")).toBeInTheDocument();
  expect(screen.getByText("1 cycle closed")).toBeInTheDocument();
  expect(screen.getByText(/0\.24 tCTC borrowed/)).toBeInTheDocument();
});

test("offers the two halves of a cycle, and dims the half that has nothing to do", async () => {
  const user = userEvent.setup();
  render(<EarnPage />);

  // Nothing owed, so Repay is dimmed rather than hidden: a control that vanishes teaches nobody
  // that it is the second half of what this screen records.
  expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Spend" }));
  expect(push).toHaveBeenCalledWith("/spend");
});

test("an open balance makes Repay the live one", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ score: 42n, limit: 1n, drawn: 5n });
  render(<EarnPage />);

  await user.click(screen.getByRole("button", { name: "Repay" }));
  expect(push).toHaveBeenCalledWith("/pay");
});
