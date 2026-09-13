/**
 * One row in the activity list.
 *
 * This lived in `lib/vault/data.ts` beside a fixture generator for Stellar buckets, which is how
 * three live files — `useTransactions`, `ActivityList`, `ActivityRow` — ended up importing the
 * SoroSense seam to render Comacard's own transactions. The import was type-only and the rows are
 * built from Creditcoin logs, so nothing was ever mocked; but "Home imports the vault client" is
 * true enough to read badly, and it was the only thing keeping that module alive.
 *
 * `cat` is the pair the old Earn screen split its feed by — the holder's own actions against the
 * agent's. Comacard has no agent, so every row is `"you"`, and the field stays only because
 * `ActivityList` still renders the distinction. `group` is the one that earns its place: it is what
 * the Transactions filter and the desktop drawer sort on.
 */
export interface ActivityItem {
  id: number;
  cat: "you" | "auto";
  kind: string;
  detail: string;
  when: string;
  /** Epoch ms. `when` is the rendered relative string; this is what date grouping sorts and splits
   *  on, because "3h ago" cannot tell you which day it was. */
  at?: number;
  flag?: boolean;
  /** Block explorer link for a row that came off a chain. */
  href?: string;
  /** Which part of the product the row belongs to, for the transactions filter. */
  group?: "card" | "deposit";
}
