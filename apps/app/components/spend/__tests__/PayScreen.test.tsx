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

test("pays the exact balance, never a rounded figure", async () => {
  const user = userEvent.setup();
  render(<PayScreen />);

  await user.click(screen.getByRole("button", { name: /^Pay/ }));

  // `repay()` reverts when msg.value exceeds the debt, so the displayed 0.24 must not be what is
  // sent back — the wei figure from the account row is.
  expect(repay).toHaveBeenCalledWith(240_000_000_000_000_000n);
});

test("offers no way to pay part of the balance", () => {
  render(<PayScreen />);

  // A partial payment settles debt and earns no mark, so an amount field here would invite the one
  // action that quietly wastes the cycle.
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByLabelText(/amount/i)).toBeNull();
  expect(screen.getByRole("button", { name: /^Pay 0\.24 tCTC$/ })).toBeInTheDocument();
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

  await user.click(screen.getByRole("button", { name: /^Pay/ }));

  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 102031 });
  expect(repay).toHaveBeenCalled();
});

test("a settled card offers nothing to pay", () => {
  creditLine.mockReturnValue(line({ drawn: 0n, drawnAt: 0n }));
  render(<PayScreen />);

  expect(screen.queryByRole("button", { name: /^Pay/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Back to home" })).toBeInTheDocument();
});
