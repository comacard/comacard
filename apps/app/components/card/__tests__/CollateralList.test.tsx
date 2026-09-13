import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CollateralAsset } from "../../../hooks/useCollateral";
import type { RemoteAsset } from "../../../hooks/useRemoteCollateral";
import { CollateralList } from "../CollateralList";

// Prices are decoration on this list and reach it over HTTP. Mocking the hook keeps these tests
// about what the rows say rather than about react-query's cache; the fallback-to-tCTC path gets a
// test of its own below.
const prices = vi.fn();
vi.mock("../../../hooks/usePrices", () => ({
  usePrices: () => ({ prices: prices(), loading: false }),
}));

beforeEach(() => {
  prices.mockReturnValue({ USDC: 1, BNB: 726, ETH: 2522, CTC: 0.1044 });
});

const asset = (over: Partial<CollateralAsset>): CollateralAsset => ({
  token: null,
  symbol: "ETH",
  name: "Ethereum",
  slug: "eth",
  decimals: 18,
  locked: 0n,
  proved: 0n,
  available: 0n,
  price: 10n ** 21n, // 1000 tCTC per whole unit
  crossing: false,
  faucetable: false,
  releasable: 0n,
  ...over,
});

test("prices each asset against its own decimals", () => {
  // 1000 tUSDC at 6 decimals, priced 1 tCTC per whole token. Treating it as 18dp would value it at
  // a trillionth of its worth, which is the whole reason `decimals` is carried per token.
  render(
    <CollateralList
      assets={[
        asset({
          token: "0x1",
          symbol: "tUSDC",
          decimals: 6,
          locked: 1_000_000_000n,
          proved: 1_000_000_000n,
          price: 10n ** 18n,
        }),
      ]}
    />,
  );
  expect(screen.getByText("1,000.00 tUSDC")).toBeInTheDocument();
  // 1,000 tUSDC at a dollar. The point of the test is the decimals: at 18dp this reads as a
  // trillionth of its worth, which is why `decimals` is carried per token.
  expect(screen.getByText("$1,000.00")).toBeInTheDocument();
});

test("reports the proved amount, not the locked one, and says what is still crossing", () => {
  // Collateral in the Sepolia vault raises nothing until Attestcoin has carried it across. Showing
  // the locked figure would claim credit the chain has not granted.
  render(
    <CollateralList
      assets={[asset({ locked: 3n * 10n ** 17n, proved: 10n ** 17n, crossing: true })]}
    />,
  );
  expect(screen.getByText("0.1000 ETH")).toBeInTheDocument();
  expect(screen.getByText("0.2000 ETH still crossing")).toBeInTheDocument();
});

test("says nothing at all when nothing is posted", () => {
  // Three empty stablecoin rows tell the holder only that the screen has rows.
  const { container } = render(
    <CollateralList assets={[asset({}), asset({ token: "0x1", symbol: "tUSDT", decimals: 6 })]} />,
  );
  expect(container).toBeEmptyDOMElement();
});

const remote = (over: Partial<RemoteAsset>): RemoteAsset => ({
  id: "0x04",
  wormholeChainId: 4,
  chainName: "BSC Testnet",
  token: `0x${"0".repeat(64)}`,
  native: true,
  decimals: 18,
  price: 600n * 10n ** 18n, // 600 tCTC per whole coin
  credited: 10n ** 16n,
  locked: 10n ** 16n,
  releasable: 0n,
  available: 0n,
  fee: 0n,
  pending: false,
  vault: null,
  evmChainId: null,
  explorer: null,
  ...over,
});

test("every row names its network, whichever carrier it arrived by", () => {
  // The Sepolia rows used to spend this line on "Released by us, not by you", which answered a
  // question about withdrawal on a list that is not about withdrawal, and left the one fact every
  // other row showed missing from exactly these two.
  render(
    <CollateralList
      assets={[asset({ token: "0x1", symbol: "tUSDC", decimals: 6, locked: 1n, proved: 1n })]}
      remote={[remote({})]}
    />,
  );

  expect(screen.getByText("Ethereum Sepolia")).toBeInTheDocument();
  expect(screen.getByText("BSC Testnet")).toBeInTheDocument();
  expect(screen.queryByText(/released by us/i)).toBeNull();
});

test("no row is a link, so none of them look half-enabled", () => {
  // A chevron on the Wormhole rows and none on the others read as a feature that failed to load.
  // Withdrawal lives in the overflow menu, which can list only what is actually withdrawable.
  render(
    <CollateralList
      assets={[asset({ token: "0x1", symbol: "tUSDC", decimals: 6, locked: 1n, proved: 1n })]}
      remote={[remote({})]}
    />,
  );

  expect(screen.queryAllByRole("link")).toHaveLength(0);
});

test("pages the list rather than growing the card without end", async () => {
  const user = userEvent.setup();
  render(
    <CollateralList
      assets={[]}
      remote={[1, 2, 3, 4, 5, 6].map((n) =>
        remote({ id: `0x0${n}`, chainName: `Chain ${n}`, wormholeChainId: n }),
      )}
    />,
  );

  expect(screen.getByText("Chain 4")).toBeInTheDocument();
  expect(screen.queryByText("Chain 5")).toBeNull();

  await user.click(screen.getByRole("button", { name: /load more/i }));
  expect(screen.getByText("Chain 5")).toBeInTheDocument();
});

test("a read still in flight is a skeleton, not an absent asset", () => {
  // The two carriers are read from different chains and land seconds apart: Sepolia answers in
  // under a second, the Wormhole hub sits on Creditcoin at about four seconds a call. Rendering
  // only what had arrived made the card look complete with BNB simply missing, then grew a row
  // under the reader.
  render(<CollateralList assets={[]} remote={[]} loading />);

  expect(screen.getByText("Assets held")).toBeInTheDocument();
  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
});

test("keeps a placeholder while the second carrier is still coming", () => {
  // Sepolia has landed, Creditcoin has not. The card says so rather than settling at one row.
  render(
    <CollateralList
      assets={[asset({ token: "0x1", symbol: "tUSDC", decimals: 6, locked: 1n, proved: 1n })]}
      remote={[]}
      loading
    />,
  );

  expect(screen.getByText("tUSDC")).toBeInTheDocument();
  expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0);
});

test("shows nothing at all once the reads are done and there is nothing to show", () => {
  const { container } = render(<CollateralList assets={[]} remote={[]} loading={false} />);
  expect(container).toBeEmptyDOMElement();
});

test("falls back to the credit value when there is no price", () => {
  // CoinGecko is rate limited or unreachable and `usePrices` answers with nothing. The tCTC figure
  // is read from the chain and is known for certain, so showing it beats showing a dash.
  prices.mockReturnValue({});
  render(
    <CollateralList
      assets={[
        asset({
          token: "0x1",
          symbol: "tUSDC",
          decimals: 6,
          locked: 1_000_000_000n,
          proved: 1_000_000_000n,
          price: 10n ** 18n,
        }),
      ]}
    />,
  );

  expect(screen.getByText("1,000.0000 tCTC")).toBeInTheDocument();
  expect(screen.queryByText(/^\$/)).toBeNull();
});

test("prices the asset itself, not the credit it grants", () => {
  // These are different questions and the answers differ by a lot: the chain prices 1 tUSDC at
  // 1 tCTC while the market prices USDC at a dollar and CTC at about ten cents. The headline on
  // this screen already answers the credit question.
  render(
    <CollateralList assets={[]} remote={[remote({ credited: 10n ** 16n })]} />, // 0.01 BNB
  );

  expect(screen.getByText("$7.26")).toBeInTheDocument();
  expect(screen.queryByText(/tCTC/)).toBeNull();
});
