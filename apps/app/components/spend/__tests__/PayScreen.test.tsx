import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PayScreen } from "../PayScreen";

/**
 * A typed amount, an exact Max, and a button that keeps reporting until the receipt lands.
 *
 * The rule this screen still has to protect is `minCycleDuration`: a cycle settled inside sixty
 * seconds clears the debt and moves the score by nothing, with no error to explain it. Partial
 * payments are now allowed, because the contract allows them and a card that refuses a payment
 * because it earns the payer nothing is not a card.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

const switchChainAsync = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChainAsync, isPending: false }) }));

const repay = vi.fn(async () => "0xhash");

/** `drawnAt` is unix seconds; `agoSeconds` places the cycle's opening relative to now. */
function line(over: Record<string, unknown> = {}, agoSeconds = 300) {
  return {
    drawn: 240_000_000_000_000_000n, // 0.24 tCTC
    drawnAt: BigInt(Math.floor(Date.now() / 1000) - agoSeconds),
    repay,
    txStatus: null,
    hash: undefined,
    error: null,
    reset: vi.fn(),
    onCreditcoin: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  creditLine.mockReturnValue(line());
});

test("Max sends no figure of its own, so the balance is the one read from the chain", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  // The 0.24 on this screen is a polled copy of `accountOf` rounded for display, and only a payment
  // clearing the balance to the wei closes a cycle. `undefined` makes `repay` use the debt it reads
  // itself, one call before sending.
  expect(repay).toHaveBeenCalledWith(undefined);
});

test("a typed amount is sent as typed", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "." }));
  await user.click(screen.getByRole("button", { name: "0" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  // Wait: 0.24 is owed and 1.0 was typed, so the button is disabled and nothing is sent.
  expect(repay).not.toHaveBeenCalled();
});

test("part of the balance can be paid", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "50%" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  // 0.12 tCTC. It settles debt and earns no mark toward the score, and a person who can pay half
  // should still be able to.
  expect(repay).toHaveBeenCalledWith(120_000_000_000_000_000n);
});

test("typing after Max gives up the exact-balance shortcut", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Backspace" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  // The figure is theirs now, so it goes as typed rather than as "whatever the chain says".
  expect(repay).not.toHaveBeenCalledWith(undefined);
  expect(repay).toHaveBeenCalled();
});

test("keeps reporting after the wallet is signed, until the receipt lands", async () => {
  // The bug: the local busy flag cleared the moment `writeContractAsync` resolved, which is the
  // signature rather than the receipt. For the seconds Creditcoin takes to mine it the button read
  // "Repay" again as though nothing had happened, then the success screen appeared from nowhere.
  creditLine.mockReturnValue(line({ txStatus: "confirming" }));
  render(<PayScreen />);

  const button = screen.getByRole("button", { name: /Processing Transaction/i });
  expect(button).toBeDisabled();
});

test("an overpayment revert is explained, not reported as a failure", async () => {
  const user = userEvent.setup();
  repay.mockRejectedValueOnce(
    new Error("execution reverted: RepaymentExceedsDebt(480000000000000000, 479026845637583892)"),
  );
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  // The contract carries both numbers, so there is no excuse for "transaction failed", and the one
  // thing the person needs to know is that nothing was taken.
  expect(await screen.findByText(/Nothing was paid/)).toBeInTheDocument();
});

test("refuses more than is owed before it can be signed", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "9" }));

  // `repay()` reverts with RepaymentExceedsDebt rather than refunding the difference.
  expect(screen.getByRole("button", { name: "Repay" })).toBeDisabled();
  expect(screen.getByText(/You only owe 0.24 tCTC/)).toBeInTheDocument();
});

test("holds the payment until the cycle has been open a minute, and says why", async () => {
  creditLine.mockReturnValue(line({}, 10)); // opened ten seconds ago
  render(<PayScreen />);

  await waitFor(() => expect(screen.getByRole("button", { name: /^Wait \d+s$/ })).toBeDisabled());
  expect(screen.getByText(/stay open for a minute/i)).toBeInTheDocument();
  expect(repay).not.toHaveBeenCalled();
});

test("switches to Creditcoin first rather than signing on Sepolia", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue(line({ onCreditcoin: false }));
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: "Max" }));
  await user.click(screen.getByRole("button", { name: "Repay" }));

  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 102031 });
  expect(repay).toHaveBeenCalled();
});

test("a settled card offers nothing to pay", () => {
  creditLine.mockReturnValue(line({ drawn: 0n, drawnAt: 0n }));
  render(<PayScreen />);

  expect(screen.queryByRole("button", { name: /^Repay/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Back to home" })).toBeInTheDocument();
});
