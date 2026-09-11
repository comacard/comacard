import { render, screen } from "@testing-library/react";
import { FaucetSection } from "../FaucetSection";

/**
 * The faucet section used to mint test USDC and EURC through the vault backend. Both faucets it
 * points at now belong to somebody else and cannot be called from a browser, so these rows are
 * links and the tests are about where they go.
 */

test("offers a Creditcoin and a Sepolia faucet, and nothing that mints", () => {
  render(<FaucetSection />);

  expect(screen.getByText("Creditcoin")).toBeInTheDocument();
  expect(screen.getByText("Sepolia ETH")).toBeInTheDocument();
  // Nothing is minted here, so nothing may say it is.
  expect(screen.queryByRole("button", { name: /mint/i })).toBeNull();
  expect(screen.queryByText(/USDC|EURC/)).toBeNull();
});

test("each Request opens the right faucet in a new tab", () => {
  render(<FaucetSection />);

  const links = screen.getAllByRole("link", { name: "Request" });
  expect(links).toHaveLength(2);

  const [ctc, eth] = links;
  expect(ctc).toHaveAttribute("href", "https://discord.gg/creditcoin");
  expect(eth).toHaveAttribute(
    "href",
    "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  );
  // A faucet that replaces the app is a faucet the user has to navigate back from.
  for (const link of links) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  }
});

