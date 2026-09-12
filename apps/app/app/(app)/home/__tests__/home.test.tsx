import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient } from "@sorosense/vault-client";
import { VaultProvider } from "../../../../providers/VaultProvider";
import { ToastProvider } from "../../../../providers/ToastProvider";
import { seedVault } from "../../../../lib/vault/seed";
import HomePage from "../page";

/**
 * The card panel fetches its unmasked number through react-query, so Home needs a client. A fresh
 * one per render keeps a cached card from one test out of the next.
 */
function withProviders(ui: React.ReactNode, client: MockVaultClient) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VaultProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </VaultProvider>
    </QueryClientProvider>,
  );
}

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
const isDesktop = vi.fn(() => false);
vi.mock("../../../../hooks/useIsDesktop", () => ({ useIsDesktop: () => isDesktop() }));

/**
 * Home's three new data sources are mocked here rather than provided. This file tests what the page
 * composes — which hero, which primary action, which rows — and wiring a real WagmiProvider in
 * would test wagmi's cache instead, over the network, from a unit test.
 */
const asset = (token: "CTC" | "ETH", amount: bigint, usd: number | null) => ({
  token,
  symbol: token === "CTC" ? "tCTC" : "ETH",
  name: token === "CTC" ? "Creditcoin" : "Ethereum",
  network: token === "CTC" ? "Creditcoin Testnet" : "Sepolia",
  amount,
  decimals: 18,
  usd,
  priceUsd: usd,
});
const walletAssets = vi.fn();
vi.mock("../../../../hooks/useWalletAssets", () => ({
  useWalletAssets: () => walletAssets(),
  toNumber: (amount: bigint) => Number((amount * 10_000n) / 10n ** 18n) / 10_000,
}));

const cardAccount = vi.fn();
vi.mock("../../../../hooks/useCardAccount", () => ({ useCardAccount: () => cardAccount() }));

vi.mock("../../../../hooks/useCreditHistory", () => ({
  useCreditHistory: () => ({
    events: [],
    borrowed: 0n,
    repaid: 0n,
    cyclesClosed: 0,
    loading: false,
    error: false,
  }),
}));

/** Home lists what backs the limit. Mocked for the same reason as the hooks above. */
const collateral = vi.fn(() => ({ assets: [], totalValue: 0n, loading: false, error: false }));
vi.mock("../../../../hooks/useCollateral", () => ({ useCollateral: () => collateral() }));

/**
 * The write client, reached by the deposit drawer and by Home's own read of what is owed. A `vi.fn`
 * so a test can put a balance on the card.
 */
const creditLine = vi.fn();
vi.mock("../../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));
const DEFAULT_LINE = {
  lock: vi.fn(),
  lockToken: vi.fn(),
  score: 0n,
  drawn: 0n,
  available: 0n,
  txStatus: null,
  hash: undefined,
  error: null,
  reset: vi.fn(),
  onSepolia: true,
};
vi.mock("wagmi", () => ({ useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }) }));

/** Four on-chain rows, in the shape the indexer hook emits. Mocked for the same reason as the two
 *  above: this file tests what Home composes, not react-query's cache over a GraphQL endpoint. */
const transactions = vi.fn();
vi.mock("../../../../hooks/useTransactions", () => ({ useTransactions: () => transactions() }));

const verify = vi.fn();
vi.mock("../../../../hooks/useKycStart", () => ({
  // Mirrors the real hook's shape: `verify` opens a session, the URL comes back through `url` for
  // KycSheet to embed. A mock that drops those silently stops exercising the sheet.
  useKycStart: () => ({
    verify,
    url: null,
    close: vi.fn(),
    starting: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

/** A funded wallet whose owner has cleared identity: the ordinary case. */
function fundedAndVerified() {
  creditLine.mockReturnValue(DEFAULT_LINE);
  walletAssets.mockReturnValue({
    loading: false,
    assets: [asset("CTC", 2_000n * 10n ** 18n, 191.08), asset("ETH", 3n * 10n ** 14n, 0.74)],
    totalUsd: 191.82,
    prices: null,
    priceError: false,
  });
  cardAccount.mockReturnValue({
    account: {
      kyc: { verified: true, status: "Approved", sessionId: "s" },
      card: { issued: true, spendableCtc: "0.4975" },
      credit: { score: 42, limitCtc: "0.4975", availableCtc: "0.4975", drawnCtc: "0.0000" },
    },
    error: null,
    loading: false,
    refresh: vi.fn(),
  });
  transactions.mockReturnValue({
    loading: false,
    error: false,
    items: [
      { id: 0, cat: "you", kind: "repaid", when: "1m ago", detail: "Repaid 0.2400 tCTC and closed the cycle" },
      { id: 1, cat: "you", kind: "drew", when: "3m ago", detail: "Borrowed 0.2400 tCTC against your card" },
      { id: 2, cat: "auto", kind: "proved", when: "8m ago", detail: "0.0006 ETH of collateral confirmed on Creditcoin" },
      { id: 3, cat: "you", kind: "collateral-locked", when: "16m ago", detail: "Locked 0.0006 ETH on Sepolia" },
    ],
  });
}

test("leads with what the card can spend, not with what the wallet holds", async () => {
  useWallet.mockReturnValue({ address: "0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0", isConnected: true });
  fundedAndVerified();
  const client = new MockVaultClient();
  await seedVault(client, "0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0");
  withProviders(<HomePage />, client);

  await waitFor(() => expect(screen.getByText("Spendable")).toBeInTheDocument());
  // One figure, not three. Limit and score stacked under it explained nothing a reader did not
  // already have to know, and both are the subject of a screen of their own.
  expect(screen.queryByText(/Limit .* · Score/)).toBeNull();

  // The wallet total used to be the headline. It read $191.82 next to a 0.4975 tCTC limit, which
  // is a card balance off by three orders of magnitude. Wallet balances now live on Account,
  // beside the faucet that fixes a low one.
  expect(screen.queryByText("2,000.00 tCTC")).toBeNull();
  expect(screen.queryByText("In your wallet")).toBeNull();

  // The card moved onto Home. The fixture has no issued card, so the folder carries the
  // not-issued label rather than a holder name.
  expect(screen.getByRole("button", { name: /not issued yet/i })).toBeInTheDocument();
  expect(screen.queryByText("Comacard holder")).toBeNull();
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.getByText("View all transactions")).toBeInTheDocument();
});

test("an empty wallet says so and offers no activity link", async () => {
  useWallet.mockReturnValue({ address: null, isConnected: false });
  walletAssets.mockReturnValue({
    loading: false,
    assets: [asset("CTC", 0n, 0), asset("ETH", 0n, 0)],
    totalUsd: 0,
    prices: null,
    priceError: false,
  });
  cardAccount.mockReturnValue({ account: null, error: null, loading: false, refresh: vi.fn() });
  creditLine.mockReturnValue(DEFAULT_LINE);
  transactions.mockReturnValue({ loading: false, error: false, items: [] });
  withProviders(<HomePage />, new MockVaultClient());

  // A card state that could not be read is not a card with nothing on it. Rendering 0.0000 tCTC
  // here would be a claim about money that nothing in this render actually knows.
  await waitFor(() => expect(screen.getByText("\u2014")).toBeInTheDocument());
  // "Spendable" still labels the hero; what must not appear is a figure under it. The row below
  // showing "0 tCTC" spent is a different number and a known one.
  expect(screen.queryByText(/0\.0000 tCTC/)).toBeNull();
  expect(screen.getByText("No transactions yet")).toBeInTheDocument();
  expect(screen.queryByText("View all activity")).toBeNull();
});

test("an unverified wallet is offered verification instead of Deposit", async () => {
  useWallet.mockReturnValue({ address: "0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0", isConnected: true });
  fundedAndVerified();
  cardAccount.mockReturnValue({
    account: { kyc: { verified: false, status: "none", sessionId: null }, card: { issued: false } },
    error: null,
    loading: false,
    refresh: vi.fn(),
  });
  const user = userEvent.setup();
  withProviders(<HomePage />, new MockVaultClient());

  const button = await screen.findByRole("button", { name: "Verify identity" });
  expect(screen.queryByRole("button", { name: "Deposit" })).toBeNull();
  await user.click(button);
  expect(verify).toHaveBeenCalled();
});

beforeEach(() => {
  fundedAndVerified();
});





test("an open balance leads with Repay but never hides Deposit", async () => {
  useWallet.mockReturnValue({ address: "0xE4db09135Ab50c59A8824ca99a6CC59D5c418fa0", isConnected: true });
  fundedAndVerified();
  creditLine.mockReturnValue({ ...DEFAULT_LINE, drawn: 1_000_000_000_000_000_000n, available: 5n });
  withProviders(<HomePage />, new MockVaultClient());

  await waitFor(() => expect(screen.getByRole("button", { name: "Repay" })).toBeInTheDocument());
  // Depositing collateral has nothing to do with owing, and an earlier version dropped it.
  expect(screen.getByRole("button", { name: "Deposit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Spend" })).toBeInTheDocument();

  // "You owe" and "Spent from your card" are different questions that happen to hold the same
  // figure until the first repayment, so only one of them is on screen at a time.
  expect(screen.queryByText("Spent from your card")).toBeNull();
});
