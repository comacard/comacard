import { render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockVaultClient} from "@sorosense/vault-client";
import { VaultProvider } from "../../../providers/VaultProvider";
import { ToastProvider } from "../../../providers/ToastProvider";
import { AccountMenu } from "../AccountMenu";

const push = vi.fn();
const openPanel = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("../../../hooks/usePanel", () => ({ usePanel: () => ({ panel: null, open: openPanel, close: vi.fn() }) }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));
/**
 * The faucet section reads collateral, wallet balances and the write client. Mocked, not provided:
 * this file tests the Account screen's own composition, and a real WagmiProvider here would test
 * wagmi's cache over the network.
 */
vi.mock("../../../hooks/useCollateral", () => ({
  useCollateral: () => ({ assets: [], totalValue: 0n, loading: false, error: false }),
}));
vi.mock("../../../hooks/useCreditLine", () => ({
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

vi.mock("../../../hooks/useWalletAssets", () => ({
  useWalletAssets: () => ({ assets: [], totalUsd: null, loading: false }),
}));


const ADDRESS = "GABCDEF12345678K3X9";
const signTransaction = vi.fn(async (xdr: string) => xdr);

beforeEach(() => {
  vi.clearAllMocks();
  useWallet.mockReturnValue({ address: ADDRESS, walletName: "Freighter", disconnect: vi.fn(), signTransaction });
});

function open(client = new MockVaultClient()) {
  render(<VaultProvider client={client}><ToastProvider><AccountMenu /></ToastProvider></VaultProvider>);
  const user = userEvent.setup();
  // jsdom exposes `navigator.clipboard` as a read-only getter in this version — Object.assign
  // throws, so Object.defineProperty is the permitted adaptation of test *setup* (not
  // assertions), matching the precedent in account/__tests__/account.test.tsx. Must run AFTER
  // userEvent.setup(): user-event installs its own navigator.clipboard stub during setup(),
  // which would otherwise clobber this mock.
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
  return user;
}

test("avatar toggles the dropdown, and it offers no setting nothing acts on", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));

  expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
  // The auto-reinvest switch is gone: it set a preference about yield on a protocol that pays
  // holders none, so toggling it changed nothing anyone could observe.
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByText(/reinvest|yield|APY/i)).toBeNull();
});



test("Activity row opens the activity panel; copy pill writes the address and shows 'Copied'", async () => {
  const user = open();
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByRole("menuitem", { name: /activity/i }));
  expect(openPanel).toHaveBeenCalledWith("activity");
  // reopen (Activity click closed it) and copy
  await user.click(screen.getByRole("button", { name: "Account" }));
  await user.click(screen.getByRole("button", { name: "Copy address" }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("GABCDEF12345678K3X9");
  expect(await screen.findByText("Copied")).toBeInTheDocument();
});
