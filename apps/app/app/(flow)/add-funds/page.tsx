import { CollateralPicker } from "../../../components/deposit/CollateralPicker";

// `/add-funds` predates `/deposit` and older links still point at it. It renders the same
// collateral picker, so no route reachable in the app offers an asset this protocol does not take.
export default function AddFundsPage() {
  return <CollateralPicker />;
}
