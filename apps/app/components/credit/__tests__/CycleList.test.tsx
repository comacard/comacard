import { render, screen } from "@testing-library/react";
import type { CreditEvent } from "../../../hooks/useCreditHistory";
import { CycleList } from "../CycleList";

/**
 * The cycle list exists to make one invisible thing visible.
 *
 * `minCycleDuration` is 60 seconds on the deployed contract. A draw repaid faster settles the debt
 * and moves the score by zero, with no error and nothing on chain to distinguish it from a cycle
 * that scored. Somebody who spent and repaid quickly twice would reasonably conclude the scoring is
 * broken, and until now no screen could tell them otherwise.
 */

const history = vi.fn();
vi.mock("../../../hooks/useCreditHistory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../hooks/useCreditHistory")>()),
  useCreditHistory: () => history(),
}));

const ONE = 10n ** 18n;
const T = 1_700_000_000;

const draw = (id: string, at: number, amount: bigint): CreditEvent => ({
  id,
  kind: "borrow",
  amount,
  at,
  txHash: `0x${id}`,
  settled: false,
});
const repay = (id: string, at: number, amount: bigint, settled: boolean): CreditEvent => ({
  id,
  kind: "repay",
  amount,
  at,
  txHash: `0x${id}`,
  settled,
});

const feed = (events: CreditEvent[]) =>
  history.mockReturnValue({ events, loading: false, error: false });

test("a closed cycle held past a minute reads as scored", () => {
  feed([draw("d1", T, ONE), repay("r1", T + 600, ONE, true)]);
  render(<CycleList />);

  expect(screen.getByText("1 tCTC")).toBeInTheDocument();
  expect(screen.getByText("Scored")).toBeInTheDocument();
});

test("a cycle closed too fast says so, in words and not by colour alone", () => {
  // The whole reason this component exists. On chain this repayment is identical to one that
  // scored; the only difference is elapsed time, and nothing else surfaces it.
  feed([draw("d1", T, ONE), repay("r1", T + 10, ONE, true)]);
  render(<CycleList />);

  expect(screen.getByText("No mark")).toBeInTheDocument();
  expect(screen.getByText(/under 60s/)).toBeInTheDocument();
  expect(screen.queryByText("Scored")).toBeNull();
});

test("an open cycle is open, not a failure", () => {
  feed([draw("d1", T, ONE)]);
  render(<CycleList />);

  expect(screen.getByText("Open")).toBeInTheDocument();
  expect(screen.queryByText("No mark")).toBeNull();
});

test("the empty state teaches what a cycle is rather than saying nothing", () => {
  feed([]);
  render(<CycleList />);

  // A card whose entire pitch is "repay cleanly and the limit grows" should say how on the screen
  // where a person finds they have never done it.
  expect(screen.getByText("No cycles yet")).toBeInTheDocument();
  expect(screen.getByText(/raises your score/)).toBeInTheDocument();
});

test("a dead indexer is not reported as no history", () => {
  history.mockReturnValue({ events: [], loading: false, error: true });
  render(<CycleList />);

  // "No cycles yet" from a failed read would be the screen asserting the one thing it cannot see.
  expect(screen.getByText("Record unavailable")).toBeInTheDocument();
  expect(screen.queryByText("No cycles yet")).toBeNull();
});

test("loading reserves rows rather than collapsing the card", () => {
  history.mockReturnValue({ events: [], loading: true, error: false });
  render(<CycleList />);

  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
  expect(screen.queryByText("No cycles yet")).toBeNull();
});

test("pages rather than growing without end", async () => {
  const events: CreditEvent[] = [];
  for (let i = 0; i < 8; i++) {
    events.push(draw(`d${i}`, T + i * 10_000, ONE));
    events.push(repay(`r${i}`, T + i * 10_000 + 600, ONE, true));
  }
  feed(events);
  render(<CycleList />);

  expect(screen.getAllByText("Scored")).toHaveLength(6);
  expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
});
