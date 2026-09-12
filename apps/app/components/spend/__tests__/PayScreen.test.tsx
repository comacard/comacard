import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PayScreen } from "../PayScreen";

/**
 * The two rules a payment screen can silently break.
 *
 * Only a payment that clears the balance to zero closes a cycle and scores, and only a cycle held
 * open past `minCycleDuration` counts at all. Both fail the same way on chain: the debt settles,
 * the score does not move, and nothing says why. These tests are what stop the UI from offering
 * either mistake.
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

test("sends no figure of its own: the debt is re-read one call before the send", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: /^Repay/ }));

  // `repay()` on chain refuses an overpayment rather than refunding it, and the 0.24 on this screen
  // is a polled copy of `accountOf`. Passing it would be right almost always and wrong exactly when
  // it matters. `useCreditLine.repay` re-reads the account and sends that, so this screen has no
  // figure to get stale — which is why it hands over nothing at all.
  expect(repay).toHaveBeenCalledWith();
});

test("an overpayment revert is explained, not reported as a failure", async () => {
  const user = userEvent.setup();
  repay.mockRejectedValueOnce(
    new Error("execution reverted: RepaymentExceedsDebt(480000000000000000, 479026845637583892)"),
  );
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: /^Repay/ }));

  // The contract carries both numbers, so there is no excuse for "transaction failed" — and the one
  // thing the person needs to know is that nothing was taken.
  expect(await screen.findByText(/Nothing was paid/)).toBeInTheDocument();
});

test("offers no way to pay part of the balance", () => {
  render(<PayScreen />);

  // A partial payment settles debt and earns no mark, so an amount field here would invite the one
  // action that quietly wastes the cycle.
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByLabelText(/amount/i)).toBeNull();
  expect(screen.getByRole("button", { name: /^Repay 0\.24 tCTC$/ })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /^Repay/ }));

  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 102031 });
  expect(repay).toHaveBeenCalled();
});

test("a settled card offers nothing to pay", () => {
  creditLine.mockReturnValue(line({ drawn: 0n, drawnAt: 0n }));
  render(<PayScreen />);

  expect(screen.queryByRole("button", { name: /^Repay/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Back to home" })).toBeInTheDocument();
});
