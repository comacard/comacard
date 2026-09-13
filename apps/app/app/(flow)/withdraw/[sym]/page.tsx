import { ReleaseSepolia } from "../../../../components/withdraw/ReleaseSepolia";

/**
 * Taking back Attestcoin collateral, addressed by symbol.
 *
 * `/withdraw/x/[id]` is the Wormhole path and keys off an asset id, because USDC on Base and USDC
 * on Arbitrum are different assets. Sepolia has one vault and one listing per symbol, so a symbol
 * is enough here and matches `/deposit/[sym]`, which is the screen this one undoes.
 */
export default async function WithdrawSepoliaPage({
  params,
}: {
  params: Promise<{ sym: string }>;
}) {
  const { sym } = await params;
  return <ReleaseSepolia slug={sym} />;
}
