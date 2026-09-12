import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollateralAsset } from "../../../hooks/useCollateral";
import { FaucetSection } from "../FaucetSection";

/**
 * Two kinds of faucet on one screen, and the tests are about keeping them apart.
 *
 * Gas comes from somebody else's faucet, so those rows must stay links that open in a new tab.
 * Collateral tokens are minted by this app against a real contract, so those rows must be buttons
 * that sign. A row of the wrong kind is a user tapping a link expecting a signature, or tapping a
 * button expecting a Discord tab.
 *
 * The three data hooks are mocked rather than provided: wiring a real WagmiProvider in would test
 * wagmi's cache over the network from a unit test.
 */

const collateral = vi.fn();
vi.mock("../../../hooks/useCollateral", () => ({ useCollateral: () => collateral() }));

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

const switchChainAsync = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useSwitchChain: () => ({ switchChainAsync }),
  useConfig: () => ({}),
}));

/** The receipt wait is the difference between "signed" and "the tokens exist". */
const waitForTransactionReceipt = vi.fn(async () => ({ status: "success" }));
vi.mock("wagmi/actions", () => ({
  waitForTransactionReceipt: () => waitForTransactionReceipt(),
}));

const invalidateQueries = vi.fn(async () => undefined);
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

const token = (over: Partial<CollateralAsset>): CollateralAsset => ({
  token: "0x0000000000000000000000000000000000000001",
  symbol: "tUSDC",
  name: "Test USD Coin",
  slug: "tusdc",
  decimals: 6,
  locked: 0n,
  proved: 0n,
  available: 0n,
  price: 10n ** 18n, // 1 tCTC per whole token
  crossing: false,
  faucetable: true,
  ...over,
});

const mint = vi.fn(async () => "0xhash");

beforeEach(() => {
  vi.clearAllMocks();
  collateral.mockReturnValue({ assets: [token({})], totalValue: 0n, loading: false, error: false });
  creditLine.mockReturnValue({ mint, onSepolia: true });
});

test("the gas faucet stays a link that opens in a new tab", () => {
  render(<FaucetSection />);

  // Every row reads "Request", so the link-vs-button split is what the assertion pins: only a
  // faucet this app cannot call may be a link that leaves it.
  const links = screen.getAllByRole("link", { name: "Request" });
  expect(links).toHaveLength(1);

  const [eth] = links;
  expect(eth).toHaveAttribute(
    "href",
    "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  );
  // A faucet that replaces the app is a faucet the user has to navigate back from.
  for (const link of links) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  }
});

test("a listed faucet token gets a Request button that calls the contract", async () => {
  const user = userEvent.setup();
  render(<FaucetSection />);

  await user.click(screen.getByRole("button", { name: "Request" }));

  // 1000 tCTC of value at 1 tCTC per whole token, in WHOLE tokens: faucet() scales by decimals
  // itself, so passing base units here would ask for 10^18 tokens and revert.
  expect(mint).toHaveBeenCalledWith("0x0000000000000000000000000000000000000001", 1000n);
});

test("scales the mint by price, so one tap is worth about the same in every asset", async () => {
  const user = userEvent.setup();
  collateral.mockReturnValue({
    assets: [token({ symbol: "tWETH", decimals: 18, price: 1000n * 10n ** 18n })],
    totalValue: 0n,
    loading: false,
    error: false,
  });
  render(<FaucetSection />);

  await user.click(screen.getByRole("button", { name: "Request" }));

  expect(mint).toHaveBeenCalledWith(expect.any(String), 1n);
});

test("a token with no faucet gets no Request button", () => {
  collateral.mockReturnValue({
    assets: [token({ faucetable: false })],
    totalValue: 0n,
    loading: false,
    error: false,
  });
  render(<FaucetSection />);

  // A mint on a token without `faucet()` is a button that reverts in the user's wallet.
  expect(screen.queryByRole("button", { name: "Request" })).toBeNull();
});

test("off Sepolia the mint switches the chain itself instead of going dead", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ mint, onSepolia: false });
  render(<FaucetSection />);

  // The wallet normally sits on Creditcoin, so a chain-gated button would be greyed out in the
  // common case with nothing on screen to act on.
  const button = screen.getByRole("button", { name: "Request" });
  expect(button).toBeEnabled();

  await user.click(button);
  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 11155111 });
  expect(mint).toHaveBeenCalled();
});

test("a declined chain switch does not go on to mint on the wrong chain", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue({ mint, onSepolia: false });
  switchChainAsync.mockRejectedValueOnce(new Error("user rejected"));
  render(<FaucetSection />);

  await user.click(screen.getByRole("button", { name: "Request" }));

  // Minting on Creditcoin reverts, and the user just said no to the switch.
  expect(mint).not.toHaveBeenCalled();
});

test("the gas faucet carries no wallet balance", () => {
  render(<FaucetSection />);

  // Getting funds is the job of this screen; reporting how many you already hold is not.
  expect(screen.queryByText(/tCTC/)).toBeNull();
  expect(screen.queryByText(/switch your wallet to sepolia/i)).toBeNull();
});

test("only the requested row goes quiet; the others stay live", async () => {
  const user = userEvent.setup();
  // Two rows, so "this one is busy" and "everything is busy" can actually be told apart.
  collateral.mockReturnValue({
    assets: [
      token({ token: "0x0000000000000000000000000000000000000001", symbol: "tUSDC" }),
      token({ token: "0x0000000000000000000000000000000000000002", symbol: "tUSDT" }),
    ],
    totalValue: 0n,
    loading: false,
    error: false,
  });
  // Held open so the in-flight state can be observed rather than raced past.
  let release: () => void = () => {};
  mint.mockImplementationOnce(
    () => new Promise<string>((resolve) => { release = () => resolve("0xhash"); }),
  );
  render(<FaucetSection />);

  const [first, second] = screen.getAllByRole("button", { name: /request/i });
  await user.click(first);

  // A single shared flag greyed out every row the moment any one was tapped: three dead buttons
  // to report one busy request.
  expect(first).toBeDisabled();
  expect(second).toBeEnabled();

  // The row runs on to its own success tick, which the other row never entered.
  release();
  await waitFor(() => expect(first).toHaveAccessibleName(/received/i));
  expect(second).toHaveAccessibleName("Request");
});

test("waits for the receipt, refetches the balance, then shows the tick", async () => {
  const user = userEvent.setup();
  render(<FaucetSection />);

  await user.click(screen.getByRole("button", { name: /request/i }));

  // Signed is not mined: a tick at signature time would claim tokens that do not exist yet.
  expect(waitForTransactionReceipt).toHaveBeenCalled();
  // And the row's balance comes from the collateral query, so landing has to invalidate it or the
  // number underneath the button stays stale until a reload.
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["comacard", "collateral"] });
  await waitFor(() => expect(screen.getByRole("button", { name: /received/i })).toBeInTheDocument());
});

test("a failed request returns the button to Request rather than sticking on a tick", async () => {
  const user = userEvent.setup();
  mint.mockRejectedValueOnce(new Error("user rejected"));
  render(<FaucetSection />);

  await user.click(screen.getByRole("button", { name: /request/i }));

  await waitFor(() => expect(screen.getByRole("button", { name: "Request" })).toBeEnabled());
  expect(screen.queryByRole("button", { name: /received/i })).toBeNull();
});
