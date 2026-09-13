import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TransactionsPage from "../page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const transactions = vi.fn();
vi.mock("../../../../hooks/useTransactions", () => ({ useTransactions: () => transactions() }));

/** One row of each group, shaped the way `useTransactions` emits them. */
const ROWS = [
  {
    id: 0,
    cat: "you",
    kind: "repaid",
    group: "card",
    when: "1m ago",
    detail: "0.2400 tCTC paid back, balance cleared",
    href: "https://creditcoin-testnet.blockscout.com/tx/0xrepay",
  },
  {
    id: 1,
    cat: "you",
    kind: "drew",
    group: "card",
    when: "3m ago",
    detail: "0.2400 tCTC from your credit limit",
    href: "https://creditcoin-testnet.blockscout.com/tx/0xdraw",
  },
  {
    id: 2,
    cat: "auto",
    kind: "proved",
    group: "deposit",
    when: "8m ago",
    detail: "0.0006 ETH now backs your credit limit",
    href: "https://creditcoin-testnet.blockscout.com/tx/0xproof",
  },
  {
    id: 3,
    cat: "you",
    kind: "collateral-locked",
    group: "deposit",
    when: "16m ago",
    detail: "0.0006 ETH put down on Ethereum",
    href: "https://sepolia.etherscan.io/tx/0xlock",
  },
];

beforeEach(() => {
  transactions.mockReturnValue({ loading: false, error: false, items: ROWS });
});

test("shows every on-chain row, newest first, with plain-language titles", () => {
  render(<TransactionsPage />);
  expect(screen.getByText("Payment")).toBeInTheDocument();
  expect(screen.getByText("Spent")).toBeInTheDocument();
  expect(screen.getByText("Deposit confirmed")).toBeInTheDocument();
  // The filter tab is also called "Deposit", so the row title is matched by its element: a tab is a
  // button, a row title is not.
  expect(screen.getByText("Deposit", { selector: "div" })).toBeInTheDocument();
  // No chain names or protocol words in what a person reads.
  expect(screen.queryByText(/attestation|collateral released|creditcoin cc3|sepolia/i)).toBeNull();
});

test("Card and Deposit each show only their own rows", async () => {
  const user = userEvent.setup();
  render(<TransactionsPage />);

  await user.click(screen.getByRole("button", { name: "Card" }));
  expect(screen.getByText("Spent")).toBeInTheDocument();
  expect(screen.queryByText("Deposit", { selector: "div" })).toBeNull();

  await user.click(screen.getByRole("button", { name: "Deposit" }));
  expect(screen.getByText("Deposit", { selector: "div" })).toBeInTheDocument();
  expect(screen.queryByText("Spent")).toBeNull();
});

test("each row opens its own transaction on the right explorer", () => {
  render(<TransactionsPage />);
  // The collateral lock happened on Ethereum, the draw on Creditcoin. A row pointing at the wrong
  // explorer is a dead link, and a dead link in a demo is worse than no link.
  const lock = screen.getByText("Deposit", { selector: "div" }).closest("a");
  expect(lock).toHaveAttribute("href", "https://sepolia.etherscan.io/tx/0xlock");
  expect(lock).toHaveAttribute("target", "_blank");
  expect(screen.getByText("Spent").closest("a")).toHaveAttribute(
    "href",
    "https://creditcoin-testnet.blockscout.com/tx/0xdraw",
  );
});

test("an empty filter explains itself instead of showing a blank card", async () => {
  const user = userEvent.setup();
  transactions.mockReturnValue({ loading: false, error: false, items: [ROWS[1]] }); // card only
  render(<TransactionsPage />);

  await user.click(screen.getByRole("button", { name: "Deposit" }));
  expect(screen.getByText("No deposit yet")).toBeInTheDocument();
});
