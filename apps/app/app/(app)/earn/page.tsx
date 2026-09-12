"use client";
import { CreditScreen } from "../../../components/credit/CreditScreen";
import { useRedirectDesktopToHome } from "../../../hooks/useRedirectDesktopToHome";

/**
 * The middle tab, kept at `/earn` because the bottom nav and every test route to that path; only
 * what it shows has changed. It reported APY on Stellar deposits, which this protocol does not pay
 * and never had — users receive no yield at all. It now reports the thing the card actually earns,
 * which is a record.
 */
export default function EarnPage() {
  if (useRedirectDesktopToHome()) return null;
  return <CreditScreen />;
}
