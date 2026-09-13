import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreditPage from "../page";

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
// `LimitWorking` needs the collateral value the limit is derived from, and `useCollateral` reaches
// for the wallet provider this test does not mount.
const collateral = vi.fn(() => ({
  assets: [],
  totalValue: 50n * 10n ** 18n,
  loading: false,
  error: false,
}));
vi.mock("../../../../hooks/useCollateral", () => ({ useCollateral: () => collateral() }));

const history = vi.fn();
vi.mock("../../../../hooks/useCreditHistory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCreditHistory: () => history(),
}));

// The chart on this screen is the limit's own history now, not spend. Spend stayed on Overview.
const limits = vi.fn();
vi.mock("../../../../hooks/useLimitHistory", () => ({ useLimitHistory: () => limits() }));

const point = (limit: bigint, at: number) => ({
  id: `p-${at}`,
  limit,
  available: limit,
  score: 42n,
  at,
  txHash: `0x${at}`,
});

function empty() {
  return { events: [], borrowed: 0n, repaid: 0n, cyclesClosed: 0, loading: false, error: false };
}

beforeEach(() => {
  vi.clearAllMocks();
  creditLine.mockReturnValue({ score: 42n, limit: 497_512_437_810_945_273n, drawn: 0n });
  history.mockReturnValue(empty());
  limits.mockReturnValue({ points: [], all: [], loading: false, error: false });
});

test("leads with the limit, not with a yield", () => {
  render(<CreditPage />);

  // The score was the headline first and read as a fault: it sits at zero straight after a deposit
  // that plainly worked, because a deposit buys a limit and only repaying earns a score.
  expect(screen.getByText("Your limit")).toBeInTheDocument();
  expect(screen.queryByText(/APY|yield|bucket/i)).toBeNull();
});

test("an empty record renders empty", () => {
  render(<CreditPage />);

  expect(screen.getByText("No limit yet")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /Limit history/ })).toBeNull();
});

test("one event is a fact, not a trend, so it is not drawn as one", () => {
  // A single point has nothing to slope against. Drawing it would put a shape on the screen whose
  // whole job is to prove the limit moved, which is the opposite of what one event establishes.
  limits.mockReturnValue({
    points: [point(33n * 10n ** 18n, 1_700_000_000)],
    all: [],
    loading: false,
    error: false,
  });
  render(<CreditPage />);

  expect(screen.getByText("Nothing has moved it yet")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: /Limit history/ })).toBeNull();
});

test("two events or more draw the history, with both ends named", () => {
  limits.mockReturnValue({
    points: [
      point(33n * 10n ** 18n, 1_700_000_000),
      point(41n * 10n ** 18n, 1_700_090_000),
      point(46n * 10n ** 18n, 1_700_100_000),
    ],
    all: [],
    loading: false,
    error: false,
  });
  render(<CreditPage />);

  expect(screen.getByText("3 changes")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /Limit history/ })).toBeInTheDocument();
  // Where it started and where it is now, because a chart with no figures on it is decoration.
  expect(screen.getByText("33 tCTC")).toBeInTheDocument();
  expect(screen.getByText("46 tCTC")).toBeInTheDocument();
});

test("a failed read says so rather than drawing an account that never moved", () => {
  // The distinction this repository keeps having to relearn: no history and no answer are different
  // facts, and a chart is incapable of showing the second.
  limits.mockReturnValue({ points: [], all: [], loading: false, error: true });
  render(<CreditPage />);

  expect(screen.getByText("History unavailable")).toBeInTheDocument();
  expect(screen.queryByText("No limit yet")).toBeNull();
});

test("offers the two halves of a cycle, and dims the half that has nothing to do", async () => {
  const user = userEvent.setup();
  render(<CreditPage />);

  // Nothing owed, so Repay is dimmed rather than hidden: a control that vanishes teaches nobody
  // that it is the second half of what this screen records.
  expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Send" }));
  expect(push).toHaveBeenCalledWith("/send");
});

test("an open balance makes Repay the live one", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ score: 42n, limit: 1n, drawn: 5n });
  render(<CreditPage />);

  await user.click(screen.getByRole("button", { name: "Repay" }));
  expect(push).toHaveBeenCalledWith("/pay");
});

test("an unread limit is a dash, never a zero", () => {
  // `loading` on this screen is the indexer's, not the chain's, so the block renders as soon as
  // the history lands while `limitOf` is still four seconds away on the Creditcoin RPC. Printing
  // "0 tCTC" there states that the card is allowed nothing, on the one screen the limit is the
  // subject of.
  creditLine.mockReturnValue({ limit: undefined, drawn: 0n, score: 42n });
  render(<CreditPage />);

  expect(screen.getByText("—")).toBeInTheDocument();
  // The balance under it is a genuine zero and is entitled to say so. What must not appear is a
  // zero standing in for the limit, so the one on screen has to be the one labelled Balance.
  const zeros = screen.queryAllByText("0 tCTC");
  expect(zeros).toHaveLength(1);
  expect(zeros[0]?.previousElementSibling?.textContent).toBe("Balance");
});

test("the score and the balance are both on the screen", () => {
  // Neither was. `drawn` was read and used only to disable Repay, so that control sat permanently
  // greyed with no figure and no reason, and the score was absent from the screen whose whole
  // subject is how the limit is earned.
  creditLine.mockReturnValue({ limit: 41n * 10n ** 18n, drawn: 13n * 10n ** 18n, score: 42n });
  render(<CreditPage />);

  expect(screen.getByText(/score 42/)).toBeInTheDocument();
  expect(screen.getByText("13 tCTC")).toBeInTheDocument();
});
