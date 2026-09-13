import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { lockNativeUri } from "../../../lib/comacard/eip681";
import { DepositQr } from "../DepositQr";

/**
 * The thing worth testing here is what the code contains, not that a QR rendered.
 *
 * A bare vault address in this code would be a trap rather than a shortcut: the vaults have no
 * `receive()`, so native coin sent to one reverts, and an ERC20 sent to one arrives and is credited
 * to nobody, with no rescue function. So the assertion is that the encoded string names the
 * function.
 */

const VAULT = "0x9d8B6852705dD7585B3907244d603547a4eA32d6" as const;
const uri = lockNativeUri(VAULT, 97, 10n ** 16n);

test("the code carries a function call, not just the vault's address", async () => {
  const user = userEvent.setup();
  render(<DepositQr uri={uri} chainName="BSC Testnet" amount="0.01 BNB" />);

  await user.click(screen.getByRole("button", { name: /sign from your phone/i }));

  // Shown as text as well as encoded, so a person can read what they are about to sign.
  const shown = screen.getByText(/^ethereum:/);
  expect(shown).toHaveTextContent("/lockNative");
  expect(shown).toHaveTextContent("@97");
  expect(shown).toHaveTextContent("value=10000000000000000");
});

test("stays closed until asked, so the signing button keeps the screen", () => {
  render(<DepositQr uri={uri} chainName="BSC Testnet" amount="0.01 BNB" />);

  // Wallet support for function-call URIs is uneven and has broken in MetaMask Mobile more than
  // once. The connected-wallet button is the mechanism; this is the convenience.
  expect(screen.queryByText(/^ethereum:/)).toBeNull();
  expect(screen.getByRole("button", { name: /sign from your phone/i })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});

test("names the amount and the chain beside the code", async () => {
  const user = userEvent.setup();
  render(<DepositQr uri={uri} chainName="BSC Testnet" amount="0.01 BNB" />);

  await user.click(screen.getByRole("button", { name: /sign from your phone/i }));

  // A wallet opening this will be asked to switch chains. Being told which one first is the
  // difference between an expected prompt and a suspicious one.
  expect(screen.getByText("0.01 BNB on BSC Testnet")).toBeInTheDocument();
});

test("says that some wallets cannot open it", async () => {
  const user = userEvent.setup();
  render(<DepositQr uri={uri} chainName="BSC Testnet" amount="0.01 BNB" />);

  await user.click(screen.getByRole("button", { name: /sign from your phone/i }));

  // A scan that silently does nothing reads as the app being broken. Naming the possibility costs
  // one line and turns a dead end into a redirection.
  expect(screen.getByText(/cannot open a request like this/i)).toBeInTheDocument();
});
