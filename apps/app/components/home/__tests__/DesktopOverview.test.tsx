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
  creditLine.mockReturnValue({
    drawn: 0n,
    available: 33n,
    loading: false,
    availableLoading: false,
  });
  creditHistory.mockReturnValue({
    events: [],
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    loading: false,
    error: false,
  });
});

test("names the page and leads with one figure, not four and not a card", () => {
  render(<DesktopOverview />);

  expect(screen.getByRole("heading", { level: 1, name: "Overview" })).toBeInTheDocument();

  // One number, not a band of four at equal weight. Available, limit, balance and lifetime spend
  // are one figure and three of its derivations, and no card product surveyed renders them as
  // peers. The other three moved to the sub-line or to the screen that is about them.
  expect(screen.getByText("Available to spend")).toBeInTheDocument();
  expect(screen.getByText("33.3333 tCTC")).toBeInTheDocument();
  expect(screen.queryByText("Credit limit")).toBeNull();
  expect(screen.queryByText("Spent from your card")).toBeNull();

  expect(screen.queryByText(/bucket|APY|Growth|Agent/i)).toBeNull();
});

test("an unread figure is a dash, never a zero", () => {
  // `limit` is absent from this mock, as it is on screen before the contract read lands. Printing
  // 0 tCTC there would state something about the account that nothing has established.
  render(<DesktopOverview />);

  expect(screen.getByText(/of — tCTC limit/)).toBeInTheDocument();
});

test("Send and Deposit are both offered, and Send goes to the full page", async () => {
  const user = userEvent.setup();
  render(<DesktopOverview />);

  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Send" }));
  // No desktop drawer exists for it, and the keypad takes a physical keyboard.
  expect(push).toHaveBeenCalledWith("/send");
});

test("an open balance leads with Repay without hiding Deposit", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({
    drawn: 1_000_000_000_000_000_000n,
    available: 5n,
    loading: false,
    availableLoading: false,
  });
  render(<DesktopOverview />);

  // The headline flips to the balance, because that is now the figure the next action depends on.
  expect(screen.getByText("Balance")).toBeInTheDocument();
  expect(screen.getByText("1 tCTC")).toBeInTheDocument();
  expect(screen.getByText(/repay in full to close this cycle/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
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
  expect(screen.getByText("Not issued yet")).toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
});

test("a dead indexer reports no spending as unknown, not as none", () => {
  creditLine.mockReturnValue({
    drawn: 1_000_000_000_000_000_000n,
    available: 5n,
    loading: false,
    availableLoading: false,
  });
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

test("a limit still being read disables Send as a wait, not as a refusal", () => {
  // The Creditcoin RPC takes about four seconds a call. For that whole window `available` is
  // undefined, and `(available ?? 0n) === 0n` rendered a flat greyed button, which says "you have
  // nothing to spend" about a figure nothing had read yet.
  creditLine.mockReturnValue({
    drawn: 0n,
    available: undefined,
    loading: true,
    availableLoading: true,
  });
  render(<DesktopOverview />);

  const spend = screen.getByRole("button", { name: "" });
  expect(spend).toBeDisabled();
  // The label is gone because a spinner is in its place; the point is that it does not read "Send"
  // beside a dead control.
  expect(screen.queryByRole("button", { name: "Send" })).toBeNull();
});

test("Send is live as soon as the figure beside it is, not when the slowest read lands", () => {
  // The bug: `loading` is an OR across limitOf, availableOf and accountOf, and `accountOf` returns
  // a struct and lands last. Send was gated on all three, so the screen showed "Spendable
  // 35.0097 tCTC" beside a spinner that refused to let anyone spend it, for seconds.
  creditLine.mockReturnValue({
    drawn: 0n,
    available: 33n,
    loading: true,
    availableLoading: false,
  });
  render(<DesktopOverview />);

  const send = screen.getByRole("button", { name: "Send" });
  expect(send).toBeInTheDocument();
  expect(send).toBeEnabled();
});
