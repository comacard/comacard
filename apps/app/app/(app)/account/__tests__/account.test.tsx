import { MockVaultClient } from "@sorosense/vault-client";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultProvider } from "../../../../providers/VaultProvider";
import AccountPage from "../page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const disconnect = vi.fn();
const useWallet = vi.fn();
vi.mock("../../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
/**
 * The faucet section reads collateral, wallet balances and the write client. Mocked, not provided:
 * this file tests the Account screen's own composition, and a real WagmiProvider here would test
 * wagmi's cache over the network.
 */
vi.mock("../../../../hooks/useCollateral", () => ({
  useCollateral: () => ({ assets: [], totalValue: 0n, loading: false, error: false }),
}));
vi.mock("../../../../hooks/useCreditLine", () => ({
  useCreditLine: () => ({ mint: vi.fn(), onSepolia: true }),
}));
vi.mock("wagmi", () => ({
  useSwitchChain: () => ({ switchChainAsync: vi.fn() }),
  useConfig: () => ({}),
}));
vi.mock("wagmi/actions", () => ({ waitForTransactionReceipt: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("../../../../hooks/useWalletAssets", () => ({
  useWalletAssets: () => ({ assets: [], totalUsd: null, loading: false }),
}));

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWK3X9";
const signTransaction = vi.fn(async (xdr: string) => xdr);

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({
    address: ADDRESS,
    walletName: "Freighter",
    isConnected: true,
    disconnect,
    signTransaction,
  });
});

function renderAccount(client = new MockVaultClient()) {
  render(
    <VaultProvider client={client}>
      <AccountPage />
    </VaultProvider>,
  );
}

test("shows the identicon and a truncated address, and names no wallet product", async () => {
  renderAccount();
  expect(await screen.findByLabelText("Wallet identicon")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /GABC\.\.\.K3X9/ })).toBeInTheDocument();
  // Which extension signed in is the user's own business and tells them nothing they need.
  expect(screen.queryByText(/Connected via/)).toBeNull();
});

test("does not claim a connection date it has no source for", async () => {
  renderAccount();
  expect(document.body.textContent).not.toMatch(/since/i);
});

test("copying the address raises a toast", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  // jsdom exposes `navigator.clipboard` as a read-only getter in this version — Object.assign
  // throws. Object.defineProperty is the permitted adaptation of test *setup* (not assertions).
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  renderAccount();
  await user.click(screen.getByRole("button", { name: /GABC\.\.\.K3X9/ }));
  expect(writeText).toHaveBeenCalledWith(ADDRESS);
  expect(await screen.findByText("Address copied")).toBeInTheDocument();
});

test("Activity routes to the central activity page", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: /Activity/ }));
  expect(push).toHaveBeenCalledWith("/transactions");
});

test("Log out confirms before disconnecting", async () => {
  const user = userEvent.setup();
  renderAccount();
  await user.click(screen.getByRole("button", { name: "Log out" }));
  expect(await screen.findByRole("dialog", { name: "Log out" })).toBeInTheDocument();
  expect(disconnect).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Yes, log out" }));
  await waitFor(() => expect(disconnect).toHaveBeenCalled());
  expect(push).toHaveBeenCalledWith("/");
});

test("R11 — Account carries no risk label", async () => {
  renderAccount();
  await screen.findByLabelText("Wallet identicon");
  expect(document.body.textContent).not.toMatch(/\b(safe|watch|risk|score|tier)\b/i);
});
