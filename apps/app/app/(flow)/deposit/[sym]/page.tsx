import { LockCollateral } from "../../../../components/deposit/LockCollateral";

export default async function DepositPage({ params }: { params: Promise<{ sym: string }> }) {
  const { sym } = await params;
  return <LockCollateral sym={sym} />;
}
