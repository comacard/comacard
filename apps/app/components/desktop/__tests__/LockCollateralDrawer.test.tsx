import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollateralAsset } from "../../../hooks/useCollateral";
import { LockCollateralDrawer } from "../LockCollateralDrawer";

/**
 * The desktop deposit drawer, which replaced one that funded Stellar buckets with USDC, EURC and
 * CETES. These tests pin the two things that made that screen wrong: the assets have to come from
 * the chain, and the write has to be the real collateral lock.
 */

const collateral = vi.fn();
vi.mock("../../../hooks/useCollateral", () => ({ useCollateral: () => collateral() }));

vi.mock("../../../hooks/useRemoteCollateral", () => ({
  useRemoteCollateral: () => ({ assets: [], totalValue: 0n, loading: false, error: false, configured: true }),
}));

const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));

const switchChainAsync = vi.fn(async () => ({}));
vi.mock("wagmi", () => ({
  useSwitchChain: () => ({ switchChainAsync, isPending: false }),
}));

const asset = (over: Partial<CollateralAsset>): CollateralAsset => ({
  token: "0x0000000000000000000000000000000000000001",
  symbol: "tUSDC",
  name: "Test USD Coin",
  slug: "tusdc",
  decimals: 6,
  locked: 0n,
  proved: 0n,
  available: 1_000_000_000n, // 1,000 tUSDC
  price: 10n ** 18n, // 1 tCTC per whole token
  crossing: false,
  faucetable: true,
  ...over,
});

const lock = vi.fn(async () => "0xnative");
const lockToken = vi.fn(async () => "0xtoken");

function line(over: Record<string, unknown> = {}) {
  return {
    lock,
    lockToken,
    score: 0n,
    txStatus: null,
    hash: undefined,
    error: null,
    reset: vi.fn(),
    onSepolia: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  collateral.mockReturnValue({
    assets: [
      asset({}),
      // 1 ETH. The default fixture's balance is in six-decimal units, and reused here it would be
      // a billionth of an ETH — enough to disable the button and make this test pass for the wrong
      // reason.
      asset({
        token: null,
        symbol: "ETH",
        name: "Ethereum",
        decimals: 18,
        available: 10n ** 18n,
      }),
    ],
    totalValue: 0n,
    loading: false,
    error: false,
  });
  creditLine.mockReturnValue(line());
});

test("lists the assets the chain says are accepted, not a hardcoded stablecoin set", () => {
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  expect(screen.getByRole("button", { name: /tUSDC/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /1 ETH$/ })).toBeInTheDocument();
  // The drawer this replaced offered these, and none of them exist in this protocol.
  expect(screen.queryByText(/EURC|CETES|Stellar/)).toBeNull();
});

test("picking a token and entering an amount locks it through lockToken", async () => {
  const user = userEvent.setup();
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /tUSDC/ }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
  await user.click(screen.getByRole("button", { name: "Lock tUSDC" }));

  // 50 tUSDC at six decimals. Sending 18-decimal base units would lock a trillion times too much.
  expect(lockToken).toHaveBeenCalledWith("0x0000000000000000000000000000000000000001", 50_000_000n);
  expect(lock).not.toHaveBeenCalled();
});

test("the native asset goes through lock(), not lockToken()", async () => {
  const user = userEvent.setup();
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /1 ETH$/ }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "0.01" } });
  await user.click(screen.getByRole("button", { name: "Lock ETH" }));

  expect(lock).toHaveBeenCalledWith(10_000_000_000_000_000n);
  expect(lockToken).not.toHaveBeenCalled();
});

test("an amount above the balance is refused before it can be signed", async () => {
  const user = userEvent.setup();
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /tUSDC/ }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "5000" } });

  expect(screen.getByRole("button", { name: "Lock tUSDC" })).toBeDisabled();
  expect(screen.getByText(/you only have/i)).toBeInTheDocument();
});

test("off Sepolia it switches the chain first rather than signing on the wrong one", async () => {
  const user = userEvent.setup();
  creditLine.mockReturnValue(line({ onSepolia: false }));
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  await user.click(screen.getByRole("button", { name: /tUSDC/ }));
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "10" } });
  await user.click(screen.getByRole("button", { name: "Lock tUSDC" }));

  expect(switchChainAsync).toHaveBeenCalledWith({ chainId: 11155111 });
  expect(lockToken).toHaveBeenCalled();
});

test("a confirmed lock drops the picker and the amount, leaving only the outcome", () => {
  creditLine.mockReturnValue(line({ txStatus: "confirmed", hash: "0xabc" }));
  render(<LockCollateralDrawer open onClose={vi.fn()} />);

  expect(screen.getByRole("status")).toHaveTextContent("Successful");
  // Both exist to help decide an amount, and there is no decision left once it has landed.
  expect(screen.queryByLabelText("Amount")).toBeNull();
  expect(screen.queryByRole("button", { name: /tUSDC/ })).toBeNull();
});
