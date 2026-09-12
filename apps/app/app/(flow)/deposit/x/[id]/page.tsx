import { LockRemoteCollateral } from "../../../../../components/deposit/LockRemoteCollateral";

/**
 * Cross-chain collateral is addressed by its asset id, not by symbol.
 *
 * `/deposit/[sym]` cannot carry these: USDC on Base and USDC on Arbitrum share a symbol and are
 * different assets in different vaults, so a symbol route would be ambiguous in the one place
 * ambiguity costs money.
 */
export default async function RemoteDepositPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LockRemoteCollateral id={id} />;
}
