import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityItem } from "../../../lib/comacard/activity";
import { ActivityDrawer } from "../ActivityDrawer";

/**
 * The desktop activity drawer, now reading the same on-chain feed as the mobile Transactions page
 * and filtering with the same three tabs.
 *
 * It used to read the SoroSense activity fixture and offer an "Agent" tab, which named machinery
 * this product does not have. The tabs are named for a secured credit card instead: you put down a
 * deposit, you get a limit, you spend and pay it back.
 */

const transactions = vi.fn();
vi.mock("../../../hooks/useTransactions", () => ({ useTransactions: () => transactions() }));
vi.mock("../../../hooks/usePendingExit", () => ({ usePendingExit: () => null }));

const item = (over: Partial<ActivityItem>): ActivityItem =>
  ({
    id: 1,
    cat: "you",
    kind: "drew",
    when: "1m ago",
    detail: "Borrowed 1.0000 tCTC against your card",
    group: "card",
    ...over,
  }) as ActivityItem;

beforeEach(() => {
  vi.clearAllMocks();
  transactions.mockReturnValue({
    loading: false,
    error: false,
    items: [
      item({ id: 1, detail: "Spent on the card", group: "card" }),
      item({ id: 2, kind: "collateral-locked", detail: "Locked collateral", group: "deposit" }),
    ],
  });
});

test("the tabs are a cardholder's, not the machinery's", () => {
  render(<ActivityDrawer open onClose={() => {}} onReview={() => {}} />);

  expect(screen.getByRole("button", { name: "Card" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /agent|yours/i })).toBeNull();
});

test("each tab shows only its own group", async () => {
  const user = userEvent.setup();
  render(<ActivityDrawer open onClose={() => {}} onReview={() => {}} />);

  expect(screen.getByText("Spent on the card")).toBeInTheDocument();
  expect(screen.getByText("Locked collateral")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Card" }));
  expect(screen.getByText("Spent on the card")).toBeInTheDocument();
  expect(screen.queryByText("Locked collateral")).toBeNull();

  await user.click(screen.getByRole("button", { name: "Deposit" }));
  expect(screen.getByText("Locked collateral")).toBeInTheDocument();
  expect(screen.queryByText("Spent on the card")).toBeNull();
});
