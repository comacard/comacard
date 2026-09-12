import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { RemoteAsset } from "../../../hooks/useRemoteCollateral";
import { ClaimableCollateral } from "../ClaimableCollateral";

/**
 * The nudge for money the protocol has finished moving and the borrower has not signed for.
 *
 * @FjrREPO's framing in #8, and the distinction the whole component rests on: between the relay
 * approving a release and the borrower claiming it, **nothing is waiting on the protocol**. So this
 * is a nudge, not a spinner — and it has to disappear when there is nothing to nudge about, because
 * a prompt that is always on screen is not a prompt.
 */

vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));

const asset = (over: Partial<RemoteAsset>): RemoteAsset =>
  ({
    id: "0xabc",
    wormholeChainId: 4,
    chainName: "BSC Testnet",
    token: "0x0",
    native: true,
    decimals: 18,
    price: 600n * 10n ** 18n,
    credited: 0n,
    locked: 0n,
    available: 0n,
    releasable: 0n,
    pending: false,
    vault: "0x9d8B6852705dD7585B3907244d603547a4eA32d6",
    evmChainId: 97,
    explorer: "https://testnet.bscscan.com",
    ...over,
  }) as RemoteAsset;

test("names the coin the chain actually pays in", () => {
  render(<ClaimableCollateral assets={[asset({ releasable: 20n * 10n ** 15n })]} />);

  // BSC pays in BNB. Calling it ETH here would be the same defect the deposit screen shipped with.
  expect(screen.getByText("0.02 BNB")).toBeInTheDocument();
  expect(screen.getByText("Waiting for you on BSC Testnet")).toBeInTheDocument();
  expect(screen.getByRole("link")).toHaveAttribute("href", "/withdraw/x/0xabc");
});

test("renders nothing at all when there is nothing waiting", () => {
  // Collateral that is still backing the limit is not money waiting: it is doing its job.
  const { container } = render(
    <ClaimableCollateral assets={[asset({ credited: 50n * 10n ** 15n, releasable: 0n })]} />,
  );

  expect(container).toBeEmptyDOMElement();
});

test("lists one row per chain, because a claim is per vault", () => {
  render(
    <ClaimableCollateral
      assets={[
        asset({ id: "0xa", releasable: 20n * 10n ** 15n }),
        asset({
          id: "0xb",
          wormholeChainId: 6,
          chainName: "Avalanche Fuji",
          releasable: 10n ** 17n,
        }),
        asset({ id: "0xc", releasable: 0n }),
      ]}
    />,
  );

  // Two claimable, and `unlockNative` is a call against one vault on one chain — they cannot be
  // collapsed into a single total.
  expect(screen.getAllByRole("link")).toHaveLength(2);
  expect(screen.getByText("0.02 BNB")).toBeInTheDocument();
  expect(screen.getByText("0.1 AVAX")).toBeInTheDocument();
});
