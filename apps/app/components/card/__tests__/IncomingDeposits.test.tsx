import { render, screen } from "@testing-library/react";
import type { PendingDeposit } from "../../../lib/comacard/api";
import { IncomingDeposits } from "../IncomingDeposits";

const deposit = (over: Partial<PendingDeposit> = {}): PendingDeposit => ({
  id: "1",
  chain: "Base Sepolia",
  amountFormatted: "0.01 ETH",
  lockTxUrl: "https://sepolia.basescan.org/tx/0xabc",
  elapsedSeconds: 120,
  waitSeconds: 900,
  slow: false,
  ...over,
});

test("names the chain and what is still arriving", () => {
  render(<IncomingDeposits deposits={[deposit()]} />);

  expect(screen.getByText("0.01 ETH from Base Sepolia")).toBeInTheDocument();
  expect(screen.getByText(/arriving in about 13 min/i)).toBeInTheDocument();
});

test("a slow deposit is late, not failed", () => {
  render(<IncomingDeposits deposits={[deposit({ slow: true, elapsedSeconds: 1800 })]} />);

  // Guardians sign on their own schedule and the deposit still lands. Calling this an error sends
  // people looking for a problem that does not exist.
  expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  expect(screen.queryByText(/fail|error|problem/i)).toBeNull();
});

test("renders nothing when nothing is in flight", () => {
  const { container } = render(<IncomingDeposits deposits={[]} />);

  // An empty "Incoming" heading would suggest something is coming when nothing is.
  expect(container).toBeEmptyDOMElement();
});

test("tolerates an API too old to send a lock link", () => {
  render(<IncomingDeposits deposits={[deposit({ lockTxUrl: null })]} />);

  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("0.01 ETH from Base Sepolia")).toBeInTheDocument();
});
