"use client";
import { CreditScreen } from "../../../components/credit/CreditScreen";

/**
 * The middle tab, kept at `/earn` because the bottom nav and every test route to that path; only
 * what it shows has changed. It reported APY on Stellar deposits, which this protocol does not pay
 * and never had — users receive no yield at all. It now reports the thing the card actually earns,
 * which is a record.
 *
 * It used to bounce desktop visitors to `/home`, on the grounds that desktop had no design for it.
 * That was true while desktop had no navigation either; now that the bar offers Credit as a
 * destination, a link that redirected the moment it was followed would be the bug. `CreditScreen`
 * carries the desktop layout itself, so both widths render the same component.
 */
export default function EarnPage() {
  return <CreditScreen />;
}
