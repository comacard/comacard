import { Database } from "bun:sqlite";

export const SCHEMA = [
  `create table if not exists sessions (
    session_id text primary key,
    wallet text not null,
    status text not null,
    decision text,
    updated_at integer not null
  )`,
  "create index if not exists sessions_wallet on sessions (wallet, updated_at)",
  // Every accepted delivery is kept verbatim: idempotency key and audit trail in one.
  `create table if not exists events (
    event_id text primary key,
    webhook_type text not null,
    raw text not null,
    received_at integer not null
  )`,
];

/**
 * The wallet's standing identity, which is not the same as its newest session.
 *
 * Ordering by recency alone let an undecided row outrank a decided one: a
 * second `POST /kyc/session` inserts `Not Started` with a fresh timestamp, that
 * row wins, and an approved wallet reads back unverified — taking its card,
 * its holder name and its PAN with it. Nothing was ever destroyed; the
 * approval was only outranked.
 *
 * An approval is a fact about the person. A later session that has not
 * concluded, or that expired or was abandoned, says nothing that can undo it,
 * so a decided row sorts first and recency only breaks ties among the rest.
 *
 * It also keeps `updated_at` stable, which matters beyond the flag: the API
 * dates a card from it, so a drifting timestamp would silently move the card's
 * expiry every time a session was started.
 */
export const LATEST_SESSION_SQL = `select session_id, status, decision, updated_at
  from sessions
  where wallet = ?
  order by (status = 'Approved') desc, updated_at desc
  limit 1`;

export type SessionRow = {
  session_id: string;
  status: string;
  decision: string | null;
  updated_at: number;
};

export function openDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  for (const statement of SCHEMA) db.run(statement);
  return db;
}
