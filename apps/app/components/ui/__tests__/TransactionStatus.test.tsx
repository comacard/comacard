import { render, screen } from "@testing-library/react";
import { TransactionStatus } from "../TransactionStatus";

test("names the three waits a person can actually tell apart", () => {
  const { rerender } = render(<TransactionStatus status="signing" />);
  // Waiting on the wallet and waiting on the chain are different problems; one spinner for both is
  // how "is it stuck?" happens.
  expect(screen.getByRole("status")).toHaveTextContent("Sign in your wallet");

  rerender(<TransactionStatus status="confirming" />);
  expect(screen.getByRole("status")).toHaveTextContent("Processing Transaction");

  rerender(<TransactionStatus status="confirmed" />);
  expect(screen.getByRole("status")).toHaveTextContent("Transaction Safe");

  rerender(<TransactionStatus status="failed" />);
  expect(screen.getByRole("status")).toHaveTextContent("Transaction Failed");
});

test("announces itself politely and exposes the raw status", () => {
  render(<TransactionStatus status="confirming" />);
  const pill = screen.getByRole("status");
  expect(pill).toHaveAttribute("aria-live", "polite");
  expect(pill).toHaveAttribute("data-status", "confirming");
});

test("shows a reason and an explorer link when there is one", () => {
  render(
    <TransactionStatus
      status="failed"
      detail="insufficient funds"
      href="https://creditcoin-testnet.blockscout.com/tx/0xabc"
    />,
  );
  expect(screen.getByText("insufficient funds")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "View transaction" });
  expect(link).toHaveAttribute("href", "https://creditcoin-testnet.blockscout.com/tx/0xabc");
  expect(link).toHaveAttribute("target", "_blank");
});
