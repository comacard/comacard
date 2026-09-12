import { ReleaseCollateral } from "../../../../../components/withdraw/ReleaseCollateral";

/**
 * Cross-chain collateral is addressed by its asset id, the same way `/deposit/x/[id]` addresses it.
 * USDC on Base and USDC on Arbitrum share a symbol and sit in different vaults, so a symbol route
 * would be ambiguous in the one place ambiguity costs money.
 */
export default async function RemoteWithdrawPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReleaseCollateral id={id} />;
}
