/**
 * "3h ago", and nothing else.
 *
 * This file also held `itemFromEntry`, which mapped the SoroSense backend's `FeedEntry` wire row
 * into a rendered one. That backend is not in this repo and the rows Comacard renders are built
 * from Creditcoin logs, so the mapper had no caller and its two type imports were the last thing
 * tying the transactions list to `lib/vault` and `lib/api`.
 *
 * Still pure and still takes `now` from the caller: reading the clock during render bakes a
 * timestamp into the SSR HTML and desyncs the first client paint.
 */

export function relativeTime(ts: number | undefined, now: number): string {
  if (ts === undefined) return "";
  const minutes = Math.floor(Math.max(0, now - ts) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
