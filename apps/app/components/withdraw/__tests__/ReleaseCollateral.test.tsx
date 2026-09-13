import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
 * nothing on screen accounting for it: which is why the stage is read from the indexer rather than
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
const writeContractAsync = vi.fn(async () => "0xsent");
vi.mock("wagmi", () => ({
  useConfig: () => ({ connectors: [] }),
  useSwitchChain: () => ({ switchChainAsync: vi.fn(), isPending: false }),
  useWriteContract: () => ({
    writeContractAsync,
    data: undefined,
    error: null,
    reset: vi.fn(),
  }),
}));
// `REMOTE_HUB` comes from NEXT_PUBLIC_REMOTE_COLLATERAL_HUB, which vitest does not load, so it is
// undefined here and every handler that needs it returns early without saying why. The rest of the
// module is kept: the chain tables and ABIs are the real ones on purpose.
vi.mock("../../../lib/comacard/contracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/comacard/contracts")>()),
  REMOTE_HUB: "0x9D77f5E1D5Afe5258cA16F808DC5BA1E9F68437f",
}));
vi.mock("wagmi/actions", () => ({
  readContract: vi.fn(async () => 0n),
  waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
}));

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
  // keypad's hint is an error message: it renders only once an entry is over the maximum.)
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
  // 30 CTC of collateral against 10 drawn at score 0 must keep 15 back, so 15 of the 30 is free,
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

/** Requested, signed by nobody yet, and nothing relayed. The state step two exists for. */
const AWAITING = {
  id: "w1",
  assetId: "0xabc",
  amount: 10n ** 16n,
  decimals: 18,
  wormholeChainId: 4,
  requestedAt: 1,
  requestTxHash: "0x1",
  approvedAt: null,
  approveTxHash: null,
  sequence: 8n,
};

test("step two is a button, not a wait on our worker", async () => {
  const user = userEvent.setup();
  // This screen used to say "nothing for you to do" here and leave the holder waiting on a daemon
  // that has been down for a day at a time (#12). `ReleaseRelay.executeRelease` carries no access
  // modifier: it verifies the message came from our hub on Creditcoin and refuses anything else,
  // so it was never ours to gate.
  withdrawals.mockReturnValue({
    items: [AWAITING],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ vaaBytes: "AQID" })),
  );
  render(<ReleaseCollateral id="0xabc" />);

  await user.click(screen.getByRole("button", { name: /send it on yourself/i }));

  await waitFor(() =>
    expect(writeContractAsync).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "executeRelease", chainId: 97 }),
    ),
  );
});

test("an unsigned release says wait, rather than reporting a failure", async () => {
  const user = userEvent.setup();
  withdrawals.mockReturnValue({
    items: [AWAITING],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  // 404 is the normal state for the first thirty seconds on BSC. It is patience, not a problem,
  // and a screen that reported it as an error would send someone looking for a fault.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 404 })),
  );
  render(<ReleaseCollateral id="0xabc" />);

  await user.click(screen.getByRole("button", { name: /send it on yourself/i }));

  expect(await screen.findByText(/have not signed this yet/i)).toBeInTheDocument();
  expect(writeContractAsync).not.toHaveBeenCalled();
});

test("the worker getting there first is not an error", async () => {
  const user = userEvent.setup();
  withdrawals.mockReturnValue({
    items: [AWAITING],
    loading: false,
    error: false,
    refresh: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ vaaBytes: "AQID" })),
  );
  writeContractAsync.mockRejectedValueOnce(new Error("execution reverted: AlreadyConsumed(0x...)"));
  render(<ReleaseCollateral id="0xabc" />);

  await user.click(screen.getByRole("button", { name: /send it on yourself/i }));

  // A success wearing an error's clothes: the release landed, just not from this wallet.
  await waitFor(() => expect(screen.queryByText(/AlreadyConsumed/)).toBeNull());
});

test("a request in flight is not an empty screen", () => {
  // Found on Axel's live withdrawal. `requestRelease` debits the hub at once and `releasable` only
  // fills in when the signature is submitted, so for that window both read zero and the guard
  // concluded there was nothing here: "Nothing of yours is held on BSC Testnet", with the money
  // already out of the hub and the VAA already signed, and the button that finishes it hidden.
  remote.mockReturnValue({
    assets: [{ ...ASSET, credited: 0n, releasable: 0n }],
    loading: false,
    refresh: vi.fn(),
  });
  withdrawals.mockReturnValue({ items: [], loading: false, error: false, refresh: vi.fn() });
  window.localStorage.setItem(
    "comacard.release.pending.v1",
    JSON.stringify([
      { assetId: "0xabc", sequence: "8", amount: "10000000000000000", at: Date.now() },
    ]),
  );

  render(<ReleaseCollateral id="0xabc" />);

  expect(screen.queryByText(/Nothing of yours is held/i)).toBeNull();
  expect(screen.getByRole("button", { name: /send it on yourself/i })).toBeInTheDocument();
  window.localStorage.clear();
});

test("the local note carries the sequence when the indexer has not caught up", async () => {
  const user = userEvent.setup();
  remote.mockReturnValue({
    assets: [{ ...ASSET, credited: 0n, releasable: 0n }],
    loading: false,
    refresh: vi.fn(),
  });
  // Indexer empty. This is the first minute after a request, which is when somebody is looking.
  withdrawals.mockReturnValue({ items: [], loading: false, error: false, refresh: vi.fn() });
  window.localStorage.setItem(
    "comacard.release.pending.v1",
    JSON.stringify([
      { assetId: "0xabc", sequence: "8", amount: "10000000000000000", at: Date.now() },
    ]),
  );
  const fetchMock = vi.fn(async () => Response.json({ vaaBytes: "AQID" }));
  vi.stubGlobal("fetch", fetchMock);

  render(<ReleaseCollateral id="0xabc" />);
  await user.click(screen.getByRole("button", { name: /send it on yourself/i }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [url] = fetchMock.mock.calls[0] as unknown as [string];
  expect(url).toMatch(/\/8$/);
  window.localStorage.clear();
});
