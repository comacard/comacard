import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { LATEST_SESSION_SQL, SCHEMA, type SessionRow } from "../src/db";

const WALLET = "0x56a2950dde6b1040d1dcc4b4c4fc314bd56efb0e";
let db: Database;

const add = (id: string, status: string, at: number, decision: string | null = null) =>
  db.run(
    "insert into sessions (session_id, wallet, status, decision, updated_at) values (?,?,?,?,?)",
    [id, WALLET, status, decision, at],
  );

const latest = () => db.prepare<SessionRow, [string]>(LATEST_SESSION_SQL).get(WALLET);

beforeEach(() => {
  db = new Database(":memory:");
  for (const statement of SCHEMA) db.run(statement);
});

describe("latest session", () => {
  test("a fresh session cannot outrank an approval", () => {
    // The state Axel's wallet was left in: approved at 12:07, new session 15:56.
    add("approved", "Approved", 1_789_214_820, '{"id_verifications":[{"full_name":"A"}]}');
    add("fresh", "Not Started", 1_789_228_560);
    const row = latest();
    expect(row?.session_id).toBe("approved");
    expect(row?.decision).not.toBeNull();
  });

  test("neither can a session that expired or was abandoned", () => {
    add("approved", "Approved", 100);
    add("gone", "Expired", 200);
    add("left", "Abandoned", 300);
    expect(latest()?.session_id).toBe("approved");
  });

  test("without an approval the newest row still wins", () => {
    add("old", "Declined", 100);
    add("new", "In Progress", 200);
    expect(latest()?.session_id).toBe("new");
  });

  test("the approval's timestamp is what surfaces, so a card's expiry holds still", () => {
    add("approved", "Approved", 1_789_214_820);
    add("fresh", "Not Started", 1_789_228_560);
    expect(latest()?.updated_at).toBe(1_789_214_820);
  });

  test("no sessions at all is not an error", () => {
    expect(latest()).toBeNull();
  });
});
