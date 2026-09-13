import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HomePage from "../page";

/**
 * The phone Home, which is the layout the desktop one was rebuilt from.
 *
 * What these pin is the order and the shape of the actions, because both were changed deliberately:
 * they sit **above** the card artwork rather than below it, and they are pills sized to their labels
 * rather than two full-width buttons. The number is what the eye lands on; these are what it can do
 * about the number, and the card is the object being described rather than a thing to scroll past.
 */

const render = (ui: React.ReactNode) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => false }));
vi.mock("../../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E", isConnected: true }),
}));

const cardAccount = vi.fn();
vi.mock("../../../../hooks/useCardAccount", () => ({ useCardAccount: () => cardAccount() }));
const creditLine = vi.fn();
vi.mock("../../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));
vi.mock("../../../../hooks/useCollateral", () => ({
  useCollateral: () => ({ assets: [], totalValue: 0n, loading: false, error: false }),
}));
vi.mock("../../../../hooks/useRemoteCollateral", () => ({
  useRemoteCollateral: () => ({ assets: [], loading: false, error: false, refresh: vi.fn() }),
}));
vi.mock("../../../../hooks/useCreditHistory", () => ({
  useCreditHistory: () => ({ events: [], borrowed: 0n, loading: false, error: false }),
}));
vi.mock("../../../../hooks/useWalletAssets", () => ({
  useWalletAssets: () => ({ loading: false, assets: [] }),
}));
vi.mock("../../../../hooks/useTransactions", () => ({
  useTransactions: () => ({ loading: false, error: false, items: [] }),
}));
vi.mock("../../../../hooks/useKycStart", () => ({
  useKycStart: () => ({
    verify: vi.fn(),
    url: null,
    close: vi.fn(),
    starting: false,
    error: null,
    clearError: vi.fn(),
  }),
}));
vi.mock("wagmi", () => ({
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useConfig: () => ({}),
}));

const VERIFIED = {
  account: {
    kyc: { verified: true, status: "Approved", sessionId: "s" },
    card: { issued: true, spendableCtc: "36.3333" },
    credit: { score: 0, limitCtc: "37.3333", availableCtc: "36.3333", drawnCtc: "1.0000" },
    pendingDeposits: [],
  },
  error: null,
  loading: false,
  refresh: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  cardAccount.mockReturnValue(VERIFIED);
  creditLine.mockReturnValue({ drawn: 0n, available: 33n, loading: false });
});

test("the actions sit above the card artwork", () => {
  const { container } = render(<HomePage />);

  const spend = screen.getByRole("button", { name: "Send" });
  const card = container.querySelector("[data-testid='card-artwork'], svg, img");
  expect(spend).toBeInTheDocument();
  // `compareDocumentPosition` rather than a class or index: it survives any amount of wrapper
  // churn, and the only thing being asserted is that one comes before the other.
  expect(
    card && spend.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("nothing is owed: Send and Deposit, and no Repay", () => {
  render(<HomePage />);

  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Repay" })).toBeNull();
});

test("an open balance adds Repay last, and the order never moves", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ drawn: 1_000_000_000_000_000_000n, available: 5n, loading: false });
  const { container } = render(<HomePage />);

  // Send · Deposit · Repay, in that order and with Send still leading. Moving the primary around as
  // state changes makes the row feel unstable: someone reaching for the same control twice should
  // find it in the same place.
  const labels = [...container.querySelectorAll("button")]
    .map((b) => b.textContent?.trim())
    .filter((t) => t === "Send" || t === "Deposit" || t === "Repay");
  expect(labels).toEqual(["Send", "Deposit", "Repay"]);

  // No figure on the control. The balance is a fact about the account, not part of its name.
  expect(screen.queryByRole("button", { name: /Repay .*tCTC/ })).toBeNull();

  await user.click(screen.getByRole("button", { name: "Repay" }));
  expect(push).toHaveBeenCalledWith("/pay");
});

test("a limit still being read disables Spend as a wait, not a refusal", () => {
  creditLine.mockReturnValue({ drawn: 0n, available: undefined, loading: true });
  render(<HomePage />);

  expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
});

test("an unverified holder is offered verification instead of the actions", () => {
  cardAccount.mockReturnValue({
    ...VERIFIED,
    account: {
      ...VERIFIED.account,
      kyc: { verified: false, status: "Not Started", sessionId: null },
    },
  });
  render(<HomePage />);

  expect(screen.getByRole("button", { name: /verify identity/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Deposit" })).toBeNull();
});

test("the overflow opens what has nowhere else to sit on Home", async () => {
  const user = userEvent.setup();
  render(<HomePage />);

  await user.click(screen.getByRole("button", { name: "More" }));

  expect(screen.getByText("All transactions")).toBeInTheDocument();
  expect(screen.getByText("Get test tokens")).toBeInTheDocument();
  // The question the collateral list otherwise raises without answering.
  expect(screen.getByText(/released by us, not by you/i)).toBeInTheDocument();
});

test("the overflow offers withdraw only for collateral that can actually come back", async () => {
  const user = userEvent.setup();
  render(<HomePage />);

  await user.click(screen.getByRole("button", { name: "More" }));

  // This wallet holds nothing on a Wormhole chain in these mocks, so there is nothing to take back.
  // Attestcoin collateral is never offered here: `approveRelease` is operator-gated, and a control
  // that ends in "ask us" is worse than no control.
  expect(screen.queryByText(/Take back/)).toBeNull();
});
