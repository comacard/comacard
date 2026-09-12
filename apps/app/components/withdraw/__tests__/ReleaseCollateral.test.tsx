import { render, screen } from "@testing-library/react";
import { ReleaseCollateral } from "../ReleaseCollateral";

/**
 * The asset here is BSC's native coin, so every label reads BNB. That is the fix these expectations
 * carry: the screen used to hardcode `native ? "ETH" : "USDC"` and would have told someone they were
 * withdrawing ETH from a chain that has none.
 *
 * A withdrawal is three transactions on two chains, and the screen's whole job is to be honest
 * about which one the borrower is in.
 *
 * The two mistakes worth pinning are opposites. Saying "withdrawn" once the guardians have signed
 * claims the money is in their wallet when it is sitting in a vault waiting for a signature they
 * have not given. And losing the request on a reload leaves them with a limit that dropped and
 * nothing on screen accounting for it — which is why the stage is read from the indexer rather than
 * remembered in component state.
 */

const ASSET = {
  id: "0xabc",
  wormholeChainId: 4,
  chainName: "BSC Testnet",
  token: "0x0000000000000000000000000000000000000000000000000000000000000000",
  native: true,
  decimals: 18,
  price: 600n * 10n ** 18n,
  credited: 50n * 10n ** 15n, // 0.05 BNB
  locked: 50n * 10n ** 15n,
  available: 0n,
  releasable: 0n,
  pending: false,
  vault: "0x9d8B6852705dD7585B3907244d603547a4eA32d6",
  evmChainId: 97,
  explorer: "https://testnet.bscscan.com",
};

const remote = vi.fn();
const withdrawals = vi.fn();
vi.mock("../../../hooks/useRemoteCollateral", () => ({
  useRemoteCollateral: () => remote(),
}));
vi.mock("../../../hooks/useRemoteWithdrawals", () => ({
  useRemoteWithdrawals: () => withdrawals(),
}));
vi.mock("../../../hooks/useCollateral", () => ({
  useCollateral: () => ({ assets: [], totalValue: 30n * 10n ** 18n, loading: false, error: false }),
}));
const creditLine = vi.fn();
vi.mock("../../../hooks/useCreditLine", () => ({ useCreditLine: () => creditLine() }));
vi.mock("../../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "0x56A2950ddE6B1040d1DCC4b4C4Fc314Bd56eFB0E", isConnected: true }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock("wagmi", () => ({
  useConfig: () => ({ connectors: [] }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn(),
    data: undefined,
    error: null,
    reset: vi.fn(),
  }),
}));
vi.mock("wagmi/actions", () => ({ readContract: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  remote.mockReturnValue({ assets: [ASSET], loading: false, refresh: vi.fn() });
  withdrawals.mockReturnValue({ items: [], loading: false, error: false, refresh: vi.fn() });
  creditLine.mockReturnValue({ drawn: 0n, score: 0n });
});

test("offers the request form, capped by what the debt leaves free", () => {
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByRole("button", { name: /Withdraw BNB/ })).toBeInTheDocument();
  expect(screen.getByText(/0\.05 BNB backing your limit on BSC Testnet/)).toBeInTheDocument();
  // Nothing is drawn, so none of it is held back and the screen says nothing about debt. (The
  // keypad's hint is an error message — it renders only once an entry is over the maximum.)
  expect(screen.queryByText(/backing what you have already spent/)).toBeNull();
});

test("a request in flight survives a reload, because it is read and not remembered", () => {
  withdrawals.mockReturnValue({
    items: [
      {
        id: "4-0",
        assetId: "0xabc",
        amount: 20n * 10n ** 15n,
        decimals: 18,
        wormholeChainId: 4,
        requestedAt: 1,
        requestTxHash: "0x1",
        approvedAt: null,
        approveTxHash: null,
      },
    ],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByText(/0\.02 BNB on its way/)).toBeInTheDocument();
  // Not a keypad: there is already a request outstanding for this asset.
  expect(screen.queryByRole("button", { name: /^Withdraw BNB$/ })).toBeNull();
});

test("an approved release leads with the signature it is waiting on", () => {
  remote.mockReturnValue({
    assets: [{ ...ASSET, releasable: 20n * 10n ** 15n }],
    loading: false,
    refresh: vi.fn(),
  });
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByText("Ready to withdraw")).toBeInTheDocument();
  // The distinction the whole screen exists for: approved is not withdrawn.
  expect(screen.getByText(/it never sends/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Withdraw 0\.02 BNB/ })).toBeInTheDocument();
});

test("a chain this wallet holds nothing on gets words, not a keypad", () => {
  remote.mockReturnValue({
    assets: [{ ...ASSET, credited: 0n, locked: 0n }],
    loading: false,
    refresh: vi.fn(),
  });
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByText("Nothing of yours is held on BSC Testnet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Withdraw/ })).toBeNull();
});

test("an open balance holds back what it needs, and names the part that is stuck", () => {
  // 30 CTC of collateral against 10 drawn at score 0 must keep 15 back, so 15 of the 30 is free —
  // half the 0.05 BNB. Asking for the other half would cost gas to learn `ReleaseWouldStrandDebt`,
  // so the screen states the split instead of letting someone find it.
  creditLine.mockReturnValue({ drawn: 10n * 10n ** 18n, score: 0n });
  render(<ReleaseCollateral id="0xabc" />);

  expect(
    screen.getByText(/0\.025 BNB of this is backing what you have already spent/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Withdraw BNB/ })).toBeInTheDocument();
});

test("a debt the collateral barely covers frees nothing at all", () => {
  // 20 drawn at score 0 needs every bit of the 30, so there is no withdrawal to offer.
  creditLine.mockReturnValue({ drawn: 20n * 10n ** 18n, score: 0n });
  render(<ReleaseCollateral id="0xabc" />);

  expect(
    screen.getByText(/0\.05 BNB of this is backing what you have already spent/),
  ).toBeInTheDocument();
});

test("the chain wins: an approved release beats an indexer still saying in flight", () => {
  // Not hypothetical. Two of the three real withdrawals on the live indexer carry `withdrawnAt`
  // with `approvedAt` still null, because the handler that fills the middle stage was broken for a
  // while and the rows were never backfilled. Trusting the indexer for the stage would have left a
  // borrower staring at "on its way" with their money sitting in the vault, claimable.
  //
  // This is @FjrREPO's rule in #8, and the ordering here is what implements it: the indexer is for
  // history, the chain for anything the user is about to act on.
  remote.mockReturnValue({
    assets: [{ ...ASSET, releasable: 20n * 10n ** 15n }],
    loading: false,
    refresh: vi.fn(),
  });
  withdrawals.mockReturnValue({
    items: [
      {
        id: "4-0",
        assetId: "0xabc",
        amount: 20n * 10n ** 15n,
        decimals: 18,
        wormholeChainId: 4,
        requestedAt: 1,
        requestTxHash: "0x1",
        approvedAt: null,
        approveTxHash: null,
      },
    ],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByText("Ready to withdraw")).toBeInTheDocument();
  expect(screen.queryByText(/on its way/)).toBeNull();
});

test("an unreachable indexer costs persistence, never a false claim", () => {
  // The hook throws rather than answering "no withdrawals", so `items` is empty and the screen
  // falls back to the request form. That is the right degradation: it under-reports a request it
  // cannot see instead of asserting there is none.
  withdrawals.mockReturnValue({ items: [], loading: false, error: true, refresh: vi.fn() });
  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.getByRole("button", { name: /Withdraw BNB/ })).toBeInTheDocument();
  expect(screen.queryByText(/on its way/)).toBeNull();
});
