"use client";
import { CreditScreen } from "../../../components/credit/CreditScreen";

/**
 * The middle tab.
 *
 * It reported APY on Stellar deposits, which this protocol does not pay and never had: users
 * receive no yield at all. It now reports the thing the card actually earns, which is a record.
 *
 * The path was `/earn` long after the tab was renamed Credit, on the grounds that the bottom nav
 * and every test addressed that path. That is a reason to do the rename carefully, not a reason to
 * leave a URL naming a product this app does not sell. `/earn` still resolves, as a redirect, so a
 * link posted before the rename does not land on a 404 during a demo.
 *
 * It used to bounce desktop visitors to `/home`, on the grounds that desktop had no design for it.
 * That was true while desktop had no navigation either; now that the bar offers Credit as a
 * destination, a link that redirected the moment it was followed would be the bug. `CreditScreen`
 * carries the desktop layout itself, so both widths render the same component.
 */
export default function CreditPage() {
  return <CreditScreen />;
}
