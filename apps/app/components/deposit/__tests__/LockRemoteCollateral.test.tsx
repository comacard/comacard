import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RemoteAsset } from "../../../hooks/useRemoteCollateral";
import { LockRemoteCollateral } from "../LockRemoteCollateral";

/**
 * The QR is offered for a native lock and withheld for a token one, and that distinction is the
 * whole point of the test.
 *
 * `lockToken` calls `safeTransferFrom`, so it needs an allowance that no URI can express. A QR for
 * one would open a confirmation that always reverts, which is worse than no QR at all: it looks
 * like the feature working right up until the signature fails.
 */

const remote = vi.fn();
vi.mock("../../../hooks/useRemoteCollateral", () => ({ useRemoteCollateral: () => remote() }));
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => ({ score: 0n }) }));
vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("wagmi", () => ({
  useConfig: () => ({}),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(),
    data: undefined,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock("wagmi/actions", () => ({ readContract: vi.fn() }));

const BNB: RemoteAsset = {
  id: "0x32cdb210881fded98093ddd313dbce19f612b2852920c975483e496c37327ba1",
  wormholeChainId: 4,
  chainName: "BSC Testnet",
  token: `0x${"0".repeat(64)}`,
  native: true,
  decimals: 18,
  price: 600n * 10n ** 18n,
  credited: 0n,
  locked: 0n,
  releasable: 0n,
  available: 10n ** 17n, // 0.1 BNB in the wallet
  pending: false,
  fee: 0n,
  vault: "0x9d8B6852705dD7585B3907244d603547a4eA32d6",
  evmChainId: 97,
  explorer: "https://testnet.bscscan.com",
};

beforeEach(() => {
  remote.mockReturnValue({ assets: [BNB], loading: false, error: false, refresh: vi.fn() });
});

test("offers the QR once an amount is entered, and encodes the function call", async () => {
  const user = userEvent.setup();
  render(<LockRemoteCollateral id={BNB.id} />);

  // Nothing typed yet: a QR for a zero-value lock is a code whose only outcome is FeeNotCovered.
  expect(screen.queryByRole("button", { name: /sign from your phone/i })).toBeNull();

  await user.click(screen.getByRole("button", { name: "50%" }));
  await user.click(screen.getByRole("button", { name: /sign from your phone/i }));

  const shown = screen.getByText(/^ethereum:/);
  expect(shown).toHaveTextContent("/lockNative");
  // EVM 97, not Wormhole 4. A URI carrying the Wormhole id names a different chain entirely.
  expect(shown).toHaveTextContent("@97");
  expect(shown).toHaveTextContent("value=50000000000000000");
});

test("the fee rides on top of the amount, exactly as the signing button sends it", async () => {
  const user = userEvent.setup();
  // `lockNative` credits `msg.value - fee`, so a code carrying only the amount would credit less
  // than the screen promised. Zero on these testnets today, which is why it is read and not assumed.
  remote.mockReturnValue({
    assets: [{ ...BNB, fee: 10n ** 14n }],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  render(<LockRemoteCollateral id={BNB.id} />);

  await user.click(screen.getByRole("button", { name: "50%" }));
  await user.click(screen.getByRole("button", { name: /sign from your phone/i }));

  expect(screen.getByText(/^ethereum:/)).toHaveTextContent("value=50100000000000000");
});

test("withholds the QR for an ERC20, which cannot be locked without an allowance first", async () => {
  const user = userEvent.setup();
  remote.mockReturnValue({
    assets: [
      {
        ...BNB,
        native: false,
        token: `0x${"0".repeat(24)}${"ab".repeat(10)}`,
        decimals: 6,
        available: 1_000_000n,
      },
    ],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  render(<LockRemoteCollateral id={BNB.id} />);

  await user.click(screen.getByRole("button", { name: "50%" }));

  expect(screen.queryByRole("button", { name: /sign from your phone/i })).toBeNull();
});

test("withholds the QR for more than the wallet holds", async () => {
  const user = userEvent.setup();
  render(<LockRemoteCollateral id={BNB.id} />);

  // Typing past the balance. The lock would revert and so would anything scanned from here.
  for (const key of ["9", "9", "9"]) {
    await user.click(screen.getByRole("button", { name: key }));
  }

  expect(screen.queryByRole("button", { name: /sign from your phone/i })).toBeNull();
});
