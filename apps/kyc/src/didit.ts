import { createHmac, timingSafeEqual } from "node:crypto";

export type Session = { sessionId: string; url: string };

export type WebhookEvent = {
  event_id?: string;
  webhook_type: string;
  timestamp: number;
  session_id?: string;
  status?: string;
  vendor_data?: string;
  decision?: unknown;
};

export type SignatureHeaders = {
  signatureV2: string | null;
  signature: string | null;
  timestamp: string | null;
};

const BASE = "https://verification.didit.me/v3";

export async function createSession(
  wallet: string,
  env: { apiKey: string; workflowId: string; callback?: string },
): Promise<Session> {
  const res = await fetch(`${BASE}/session/`, {
    method: "POST",
    headers: { "x-api-key": env.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      workflow_id: env.workflowId,
      vendor_data: wallet,
      callback: env.callback,
    }),
  });
  if (!res.ok) throw new Error(`didit ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { session_id: string; url: string };
  return { sessionId: body.session_id, url: body.url };
}

/** Sorted keys, compact separators, Unicode left unescaped — Didit's V2 canonical form. */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function hmacEquals(secret: string, input: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(input, "utf8").digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Accepts the webhook if X-Signature-V2 matches the canonical JSON, or, failing
 * that, if legacy X-Signature matches the raw bytes. Both authenticate the whole
 * body. The fallback exists because JSON.stringify renders `1.0` as `1` while
 * Didit's canonicaliser keeps `1.0`, so V2 can miss on payloads with float
 * fields; the raw bytes never change because Bun hands them to us untouched.
 */
export function verifyWebhook(
  rawBody: string,
  headers: SignatureHeaders,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (!headers.timestamp || Math.abs(now - Number(headers.timestamp)) > 300) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return false;
  }
  return (
    hmacEquals(secret, canonicalize(parsed), headers.signatureV2) ||
    hmacEquals(secret, rawBody, headers.signature)
  );
}

export function parseWebhook(rawBody: string): WebhookEvent | null {
  const e = JSON.parse(rawBody) as Partial<WebhookEvent>;
  if (typeof e.webhook_type !== "string") return null;
  return e as WebhookEvent;
}

/**
 * Idempotency key. Real deliveries carry `event_id`; console test webhooks do
 * not, so fall back to the envelope fields Didit itself recommends keying on.
 */
export function eventKey(e: WebhookEvent): string {
  return e.event_id ?? `${e.session_id}:${e.status}:${e.webhook_type}:${e.timestamp}`;
}

/** Session events carry the fields we key on; entity/transaction events do not. */
export function isSessionEvent(
  e: WebhookEvent,
): e is WebhookEvent & { session_id: string; status: string; vendor_data: string } {
  return (
    (e.webhook_type === "status.updated" || e.webhook_type === "data.updated") &&
    typeof e.session_id === "string" &&
    typeof e.status === "string" &&
    typeof e.vendor_data === "string"
  );
}
