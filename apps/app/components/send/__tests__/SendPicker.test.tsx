import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { SendPicker } from "../SendPicker";

/**
 * The picker's whole job is to be honest that both routes go through the borrower's own wallet.
 *
 * `draw()` ends in `Address.sendValue(payable(msg.sender), amount)` — there is no destination
 * parameter — so "to another wallet" is the same draw plus a second transaction. A picker that
 * implied otherwise would be advertising a transfer feature the credit line does not have.
 */

vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));
vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E", isConnected: true }),
}));

test("offers the two destinations, and counts the signatures rather than the recipients", () => {
  render(<SendPicker />);

  // The recipient is the obvious difference and the uninteresting one. What actually changes is how
  // many times a person signs.
  expect(screen.getByText(/One signature/)).toBeInTheDocument();
  expect(screen.getByText(/Two signatures/)).toBeInTheDocument();
});

test("names the wallet the credit will land in", () => {
  render(<SendPicker />);

  // Truncated, and it is the connected wallet rather than a placeholder: someone about to borrow
  // should be able to check where it is going before they sign, not after.
  expect(screen.getByText(/0x56A2…FB0E/)).toBeInTheDocument();
});

test("both rows lead somewhere real", () => {
  render(<SendPicker />);

  const links = screen.getAllByRole("link");
  expect(links.map((a) => a.getAttribute("href"))).toEqual(["/send/me", "/send/to"]);
});

test("offers nothing the product does not have", () => {
  render(<SendPicker />);

  // The reference app this is modelled on has "To Kolo User", "To IBAN" and "Between Wallets".
  // There is no directory of users here, no bank rail, and one wallet per holder, and a row that
  // opens a screen saying "coming soon" is worth less than no row.
  expect(screen.queryByText(/IBAN|Between Wallets|contact/i)).toBeNull();
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
