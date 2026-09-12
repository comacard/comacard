import { CollateralPicker } from "../../../components/deposit/CollateralPicker";

// `/add-funds` predates `/deposit` and is still linked from the SoroSense screens. It renders the
// same collateral picker rather than the old Stellar stablecoin list, so no route reachable in the
// app offers assets this protocol does not accept.
export default function AddFundsPage() {
  return <CollateralPicker />;
}
