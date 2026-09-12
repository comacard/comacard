import { render, screen } from "@testing-library/react";
import { CollateralList } from "../CollateralList";
import type { CollateralAsset } from "../../../hooks/useCollateral";

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
  expect(screen.getByText("1,000.0000 tCTC")).toBeInTheDocument();
});

test("reports the proved amount, not the locked one, and says what is still crossing", () => {
  // Collateral in the Sepolia vault raises nothing until Attestcoin has carried it across. Showing
  // the locked figure would claim credit the chain has not granted.
  render(
    <CollateralList
      assets={[
        asset({ locked: 3n * 10n ** 17n, proved: 10n ** 17n, crossing: true }),
      ]}
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
