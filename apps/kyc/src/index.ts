import { Database } from "bun:sqlite";
import { createSession, eventKey, isSessionEvent, parseWebhook, verifyWebhook } from "./didit";
import { docsHtml, openapi } from "./openapi";

const port = Number(process.env.PORT ?? 3002);
const env = {
  apiKey: must("DIDIT_API_KEY"),
  workflowId: must("DIDIT_WORKFLOW_ID"),
  webhookSecret: must("DIDIT_WEBHOOK_SECRET"),
  callback: process.env.KYC_CALLBACK_URL,
};

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

// ponytail: sqlite file on disk; move to Postgres when this runs on >1 instance.
const db = new Database(process.env.KYC_DB_PATH ?? "kyc.sqlite", { create: true });
db.run(`create table if not exists sessions (
  session_id text primary key,
  wallet text not null,
  status text not null,
  decision text,
  updated_at integer not null
)`);
db.run("create index if not exists sessions_wallet on sessions (wallet, updated_at)");
// Every accepted delivery is kept verbatim: idempotency key and audit trail in one.
db.run(`create table if not exists events (
  event_id text primary key,
  webhook_type text not null,
  raw text not null,
  received_at integer not null
)`);

// Didit hands back the same session while one is still open for this wallet,
// so a second request must not fail on the primary key.
const insertSession = db.prepare(
  "insert or ignore into sessions (session_id, wallet, status, updated_at) values (?, ?, 'Not Started', ?)",
);
const upsertStatus = db.prepare(
  `insert into sessions (session_id, wallet, status, decision, updated_at) values (?, ?, ?, ?, ?)
   on conflict (session_id) do update set
     status = excluded.status,
     decision = coalesce(excluded.decision, sessions.decision),
     updated_at = excluded.updated_at`,
);
const insertEvent = db.prepare(
  "insert or ignore into events (event_id, webhook_type, raw, received_at) values (?, ?, ?, ?)",
);
const latest = db.prepare<
  { session_id: string; status: string; decision: string | null; updated_at: number },
  [string]
>(
  "select session_id, status, decision, updated_at from sessions where wallet = ? order by updated_at desc limit 1",
);

const isAddress = (s: unknown): s is string =>
  typeof s === "string" && /^0x[0-9a-fA-F]{40}$/.test(s);
const now = () => Math.floor(Date.now() / 1000);

const server = Bun.serve({
  port,
  routes: {
    "/health": () => Response.json({ ok: true }),
    "/openapi.json": () => Response.json(openapi),
    "/docs": () =>
      new Response(docsHtml("/openapi.json"), { headers: { "content-type": "text/html" } }),

    "/kyc/session": {
      POST: async (req) => {
        const body = (await req.json().catch(() => ({}))) as { wallet?: unknown };
        if (!isAddress(body.wallet)) {
          return Response.json({ error: "expected { wallet: 0x-address }" }, { status: 400 });
        }
        const wallet = body.wallet.toLowerCase();
        try {
          const session = await createSession(wallet, env);
          insertSession.run(session.sessionId, wallet, now());
          return Response.json(session);
        } catch (err) {
          console.error(err);
          return Response.json({ error: "kyc provider unavailable" }, { status: 502 });
        }
      },
    },

    "/kyc/webhook": {
      POST: async (req) => {
        const raw = await req.text();
        const headers = {
          signatureV2: req.headers.get("x-signature-v2"),
          signature: req.headers.get("x-signature"),
          timestamp: req.headers.get("x-timestamp"),
        };
        if (!verifyWebhook(raw, headers, env.webhookSecret)) {
          console.warn("didit webhook rejected", { headers, raw });
          return new Response("bad signature", { status: 401 });
        }

        const event = parseWebhook(raw);
        if (!event) return new Response("bad payload", { status: 400 });
        if (insertEvent.run(eventKey(event), event.webhook_type, raw, now()).changes === 0) {
          return new Response("duplicate");
        }
        // Entity / transaction / activity events are stored above and acknowledged;
        // only session events change what the card is allowed to do.
        if (!isSessionEvent(event)) return new Response("stored");

        upsertStatus.run(
          event.session_id,
          event.vendor_data.toLowerCase(),
          event.status,
          event.decision === undefined ? null : JSON.stringify(event.decision),
          event.timestamp,
        );
        console.log(`didit ${event.webhook_type} ${event.vendor_data} → ${event.status}`);
        return new Response("ok");
      },
    },

    "/kyc/status/:wallet": (req) => {
      const wallet = req.params.wallet.toLowerCase();
      if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });
      const row = latest.get(wallet);
      return Response.json({
        wallet,
        sessionId: row?.session_id ?? null,
        status: row?.status ?? "none",
        verified: row?.status === "Approved",
        updatedAt: row?.updated_at ?? null,
      });
    },
  },
  fetch: () => new Response("not found", { status: 404 }),
});

console.log(`comacard kyc on :${server.port}`);
