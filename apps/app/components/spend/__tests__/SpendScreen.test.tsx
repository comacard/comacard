import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpendScreen } from "../SpendScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

const switchChainAsync = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChainAsync, isPending: false }) }));

const draw = vi.fn(async () => "0xhash");

function line(over: Record<string, unknown> = {}) {
  return {
    available: 33_333_333_333_333_333_333n, // 33.3333 tCTC
    draw,
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

test("spends what was typed, bounded by the card's available credit", async () => {
  const user = userEvent.setup();
  render(<SpendScreen />);

  await user.keyboard("1");
  await user.click(screen.getByRole("button", { name: "Send" }));

  expect(draw).toHaveBeenCalledWith(10n ** 18n);
});

test("refuses more than the card has, before it can be signed", async () => {
  const user = userEvent.setup();
  render(<SpendScreen />);

  await user.keyboard("100");

  expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  expect(draw).not.toHaveBeenCalled();
});

test("switches to Creditcoin first: this write is not on Sepolia", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue(line({ onCreditcoin: false }));
  render(<SpendScreen />);

  await user.keyboard("1");
  await user.click(screen.getByRole("button", { name: "Send" }));

  // The deposit screen signs on Sepolia and this one does not; getting it backwards produces a
  // chain-mismatch failure at signing time.
  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 102031 });
  expect(draw).toHaveBeenCalled();
});

test("says where the money actually goes, since there is no merchant", () => {
  render(<SpendScreen />);

  expect(screen.getByText(/arrives in your wallet/i)).toBeInTheDocument();
});

test("uses the cardholder's words, not the contract's", () => {
  render(<SpendScreen />);

  // Cardholder vocabulary, never the contract's: `draw` and "outstanding principal" are ledger
  // entries, and a screen named after them needs a glossary.
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  expect(screen.queryByText(/draw|principal|outstanding/i)).toBeNull();
});

test("carries the words of the picker row that opened it", () => {
  render(<SpendScreen />);

  // `SendPicker`'s first row says "To my wallet". A title that renamed itself between the tap and
  // the screen would read as a different destination, so the heading repeats the row verbatim.
  expect(screen.getByText("To my wallet")).toBeInTheDocument();
});
