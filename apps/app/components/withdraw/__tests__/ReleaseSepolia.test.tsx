import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollateralAsset } from "../../../hooks/useCollateral";
import { ReleaseSepolia } from "../ReleaseSepolia";

/**
 * The Attestcoin half of a release, which is two steps by two different people.
 *
 * `approveTokenRelease` is `onlyRole(OPERATOR_ROLE)` and `unlockToken` pays out up to what was
 * approved. This screen owns the second step and must be honest that it does not own the first:
 * "you cannot withdraw this" and "nobody has approved it yet" are different sentences and only the
 * second is true.
 */

const asset = (over: Partial<CollateralAsset>): CollateralAsset => ({
  token: "0x2eECfA1eb55154483726314235f74ac324e2660F",
  symbol: "tUSDC",
  name: "Test USDC",
  slug: "tusdc",
  decimals: 6,
  locked: 50_000_000n,
  proved: 50_000_000n,
  available: 0n,
  price: 10n ** 18n,
  crossing: false,
  faucetable: true,
  releasable: 0n,
  ...over,
});

const collateral = vi.fn();
vi.mock("../../../hooks/useCollateral", () => ({ useCollateral: () => collateral() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

const writeContractAsync = vi.fn(async () => "0xsent");
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync }),
}));
vi.mock("wagmi/actions", () => ({
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
}));
vi.mock("../../../lib/comacard/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/comacard/contracts")>()),
  SOURCE_VAULT: "0x911290c37E9558C704870f4C44CBdEA1B2B33303",
}));

beforeEach(() => {
  vi.clearAllMocks();
  collateral.mockReturnValue({ assets: [asset({})], loading: false, error: false });
});

test("says who clears a release, rather than just offering nothing", () => {
  render(<ReleaseSepolia slug="tusdc" />);

  // Axel repaid in full and asked how to get his 50 tUSDC back. Before this there was no screen at
  // all, which reads as the collateral being stuck rather than as a step belonging to someone else.
  expect(screen.getByText(/cleared for release by us, not by you/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nothing cleared yet" })).toBeDisabled();
});

test("still names the holding, so the screen is not just a refusal", () => {
  render(<ReleaseSepolia slug="tusdc" />);

  expect(screen.getByText("50 tUSDC on Ethereum Sepolia")).toBeInTheDocument();
});

test("an approved release is one signature, and it calls unlockToken", async () => {
  const user = userEvent.setup();
  collateral.mockReturnValue({
    assets: [asset({ releasable: 50_000_000n })],
    loading: false,
    error: false,
  });
  render(<ReleaseSepolia slug="tusdc" />);

  await user.click(screen.getByRole("button", { name: /^Withdraw 50 tUSDC$/ }));

  await waitFor(() =>
    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "unlockToken",
        args: ["0x2eECfA1eb55154483726314235f74ac324e2660F", 50_000_000n],
        chainId: 11155111,
      }),
    ),
  );
});

test("the native asset uses unlock, not unlockToken", async () => {
  const user = userEvent.setup();
  // Different functions on the same vault. `token === null` is how this type spells the chain's own
  // coin, and calling unlockToken with a null address would revert in the wallet.
  collateral.mockReturnValue({
    assets: [
      asset({ token: null, symbol: "ETH", slug: "eth", decimals: 18, releasable: 10n ** 17n }),
    ],
    loading: false,
    error: false,
  });
  render(<ReleaseSepolia slug="eth" />);

  await user.click(screen.getByRole("button", { name: /^Withdraw 0.1 ETH$/ }));

  await waitFor(() =>
    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "unlock", args: [10n ** 17n] }),
    ),
  );
});

test("prices the allowance against the token's own decimals", () => {
  // 6dp tUSDC. At 18 this reads as a trillionth of itself, on the screen that hands it back.
  collateral.mockReturnValue({
    assets: [asset({ releasable: 1_500_000n })],
    loading: false,
    error: false,
  });
  render(<ReleaseSepolia slug="tusdc" />);

  expect(screen.getByText("1.5 tUSDC")).toBeInTheDocument();
});

test("an unknown symbol says nothing is held rather than rendering an empty form", () => {
  render(<ReleaseSepolia slug="doge" />);

  expect(screen.getByText(/Nothing of yours is held on Sepolia/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /withdraw/i })).toBeNull();
});
