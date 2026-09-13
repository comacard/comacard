import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DesktopOverview } from "../DesktopOverview";

/**
 * The desktop Overview after it stopped being a SoroSense dashboard.
 *
 * It is built from the same components and the same hooks as the mobile Home, so these tests are
 * about what desktop composes, not about re-proving each piece: the card leads, cross-chain
 * collateral is listed, and nothing reports a bucket or an APY.
 */

/**
 * `CardFolderPanel` fetches the unmasked card through react-query, and the activity drawer still
 * reaches the vault seam left over from the port, so both providers have to be present.
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
vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0", isConnected: true }),
}));

const cardAccount = vi.fn();
vi.mock("../../../hooks/useCardAccount", () => ({ useCardAccount: () => cardAccount() }));

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

vi.mock("../../../hooks/useCollateral", () => ({
  useCollateral: () => ({ assets: [], totalValue: 0n, loading: false, error: false }),
}));
vi.mock("../../../hooks/useRemoteCollateral", () => ({
  useRemoteCollateral: () => ({
    assets: [],
    totalValue: 0n,
    loading: false,
    error: false,
    configured: true,
  }),
}));
const creditHistory = vi.fn();
vi.mock("../../../hooks/useCreditHistory", () => ({ useCreditHistory: () => creditHistory() }));
vi.mock("../../../hooks/useWalletAssets", () => ({
  useWalletAssets: () => ({
    loading: false,
    assets: [],
    totalUsd: null,
    prices: null,
    priceError: false,
  }),
}));
vi.mock("../../../hooks/useTransactions", () => ({
  useTransactions: () => ({ loading: false, error: false, items: [] }),
}));
vi.mock("../../../hooks/useKycStart", () => ({
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
    card: { issued: true, spendableCtc: "33.3333" },
    credit: { score: 0, limitCtc: "33.3333", availableCtc: "33.3333", drawnCtc: "0.0000" },
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
  creditHistory.mockReturnValue({
    events: [],
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    loading: false,
    error: false,
  });
});

test("names the page and leads with the four figures, not with a card", () => {
  render(<DesktopOverview />);

  // Desktop used to open on a rounded rectangle with no statement of which screen it was, and with
  // two destinations in the nav bar that is a real question.
  expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();

  // The screen's whole subject. Before the strip, two of these were not on the page at all and
  // "do I owe anything" was answered by whether a box existed.
  expect(screen.getByText("Available to spend")).toBeInTheDocument();
  expect(screen.getByText("33.3333 tCTC")).toBeInTheDocument();
  expect(screen.getByText("Credit limit")).toBeInTheDocument();
  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("Spent from your card")).toBeInTheDocument();

  expect(screen.queryByText(/bucket|APY|Growth|Agent/i)).toBeNull();
});

test("an unread figure is a dash, never a zero", () => {
  // `limit` is absent from this mock, as it is on screen before the contract read lands. Printing
  // 0 tCTC there would state something about the account that nothing has established.
  render(<DesktopOverview />);

  expect(screen.getByText("—")).toBeInTheDocument();
});

test("Spend and Deposit are both offered, and Spend goes to the full page", async () => {
  const user = userEvent.setup();
  render(<DesktopOverview />);

  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Spend" }));
  // No desktop drawer exists for it, and the keypad takes a physical keyboard.
  expect(push).toHaveBeenCalledWith("/spend");
});

test("an open balance leads with Repay without hiding Deposit", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ drawn: 1_000_000_000_000_000_000n, available: 5n, loading: false });
  render(<DesktopOverview />);

  // The figure lives in the strip; the card holds the control alone, so the balance is stated once.
  expect(screen.getByText("1 tCTC")).toBeInTheDocument();
  expect(screen.getByText("Repay in full to close the cycle")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Spend" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Repay balance" }));
  expect(push).toHaveBeenCalledWith("/pay");
});

test("an unissued card reports no spendable figure rather than zero", () => {
  cardAccount.mockReturnValue({
    ...VERIFIED,
    account: {
      ...VERIFIED.account,
      kyc: { verified: false, status: "Not Started", sessionId: null },
    },
  });
  render(<DesktopOverview />);

  // 0.0000 tCTC here reads as "your card is empty", which is a claim about money that nothing knows.
  expect(screen.getByText("Card not issued yet")).toBeInTheDocument();
  expect(screen.queryByText("33.3333 tCTC")).toBeNull();
});

test("an unverified holder is offered verification instead of the actions", async () => {
  cardAccount.mockReturnValue({
    ...VERIFIED,
    account: {
      ...VERIFIED.account,
      kyc: { verified: false, status: "Not Started", sessionId: null },
    },
  });
  render(<DesktopOverview />);

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /verify identity/i })).toBeInTheDocument(),
  );
  expect(screen.queryByRole("button", { name: "Spend" })).toBeNull();
});

test("a dead indexer reports no spending as unknown, not as none", () => {
  creditLine.mockReturnValue({ drawn: 1_000_000_000_000_000_000n, available: 5n, loading: false });
  creditHistory.mockReturnValue({
    events: [],
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    loading: false,
    error: true,
  });
  render(<DesktopOverview />);

  // "Spent from your card 0 tCTC" beside a 1 tCTC balance read live off the chain is a pair of
  // statements that cannot both hold. The balance is the one that came from a live read.
  expect(screen.getByText("1 tCTC")).toBeInTheDocument();
  expect(screen.queryByText("0 tCTC")).toBeNull();
});

test("a limit still being read disables Spend as a wait, not as a refusal", () => {
  // The Creditcoin RPC takes about four seconds a call. For that whole window `available` is
  // undefined, and `(available ?? 0n) === 0n` rendered a flat greyed button — which says "you have
  // nothing to spend" about a figure nothing had read yet.
  creditLine.mockReturnValue({ drawn: 0n, available: undefined, loading: true });
  render(<DesktopOverview />);

  const spend = screen.getByRole("button", { name: "" });
  expect(spend).toBeDisabled();
  // The label is gone because a spinner is in its place; the point is that it does not read "Spend"
  // beside a dead control.
  expect(screen.queryByRole("button", { name: "Spend" })).toBeNull();
});
