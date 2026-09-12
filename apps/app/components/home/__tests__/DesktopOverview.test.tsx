import { MockVaultClient } from "@sorosense/vault-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultProvider } from "../../../providers/VaultProvider";
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
      <VaultProvider client={new MockVaultClient()}>{ui}</VaultProvider>
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
vi.mock("../../../hooks/useCreditHistory", () => ({
  useCreditHistory: () => ({
    events: [],
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    loading: false,
    error: false,
  }),
}));
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
  creditLine.mockReturnValue({ drawn: 0n, available: 33n });
});

test("leads with the card and offers no bucket or yield", () => {
  render(<DesktopOverview />);

  expect(screen.getByText("Spendable")).toBeInTheDocument();
  expect(screen.queryByText(/bucket|APY|Growth|Agent/i)).toBeNull();
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
  creditLine.mockReturnValue({ drawn: 1_000_000_000_000_000_000n, available: 5n });
  render(<DesktopOverview />);

  expect(screen.getByText("Current balance")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Repay" }));
  expect(push).toHaveBeenCalledWith("/pay");
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
