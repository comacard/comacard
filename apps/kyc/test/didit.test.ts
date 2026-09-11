import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  canonicalize,
  eventKey,
  isSessionEvent,
  nameFromDecision,
  parseWebhook,
  verifyWebhook,
} from "../src/didit";

const secret = "shh";
const hmac = (s: string) => createHmac("sha256", secret).update(s).digest("hex");

// Keys deliberately unsorted, with Unicode, to exercise canonicalisation.
const raw = `{"webhook_type":"status.updated","vendor_data":"0xabc","status":"Approved","session_id":"s1","timestamp":1000,"event_id":"e1","metadata":{"name":"Yehéskiel"}}`;
const none = { signatureV2: null, signature: null, timestamp: "1000" };

describe("canonicalize", () => {
  test("sorts keys recursively, compact, unicode preserved", () => {
    expect(canonicalize(JSON.parse(raw))).toBe(
      `{"event_id":"e1","metadata":{"name":"Yehéskiel"},"session_id":"s1","status":"Approved","timestamp":1000,"vendor_data":"0xabc","webhook_type":"status.updated"}`,
    );
  });
});

describe("verifyWebhook", () => {
  test("accepts X-Signature-V2 over canonical JSON", () => {
    const sig = hmac(canonicalize(JSON.parse(raw)));
    expect(verifyWebhook(raw, { ...none, signatureV2: sig }, secret, 1100)).toBe(true);
  });
  test("falls back to legacy X-Signature over raw bytes", () => {
    expect(verifyWebhook(raw, { ...none, signature: hmac(raw) }, secret, 1100)).toBe(true);
  });
  test("rejects a tampered body under both schemes", () => {
    const h = { ...none, signatureV2: hmac(canonicalize(JSON.parse(raw))), signature: hmac(raw) };
    expect(verifyWebhook(raw.replace("Approved", "Declined"), h, secret, 1100)).toBe(false);
  });
  test("rejects a stale timestamp", () => {
    expect(verifyWebhook(raw, { ...none, signature: hmac(raw) }, secret, 1400)).toBe(false);
  });
  test("rejects missing headers and non-JSON", () => {
    expect(verifyWebhook(raw, none, secret, 1100)).toBe(false);
    expect(verifyWebhook("nope", { ...none, signature: hmac("nope") }, secret, 1100)).toBe(false);
  });
});

describe("parseWebhook / isSessionEvent", () => {
  test("session event carries status", () => {
    const e = parseWebhook(raw);
    expect(e && isSessionEvent(e)).toBe(true);
  });
  test("entity event is parsed but not a session event", () => {
    const e = parseWebhook(
      '{"event_id":"e2","webhook_type":"user.status.updated","timestamp":1,"status":"FLAGGED"}',
    );
    expect(e?.webhook_type).toBe("user.status.updated");
    expect(e && isSessionEvent(e)).toBe(false);
  });
  test("missing webhook_type → null", () => {
    expect(parseWebhook('{"status":"Approved"}')).toBeNull();
  });
  test("eventKey falls back to envelope when event_id is absent (console test webhooks)", () => {
    const e = parseWebhook(
      '{"webhook_type":"status.updated","session_id":"s1","status":"Approved","timestamp":7}',
    );
    expect(e && eventKey(e)).toBe("s1:Approved:status.updated:7");
    expect(eventKey({ event_id: "e9", webhook_type: "x", timestamp: 1 })).toBe("e9");
  });
});

describe("nameFromDecision", () => {
  test("full_name from the plural array", () => {
    expect(nameFromDecision({ id_verifications: [{ full_name: " María García López " }] })).toBe(
      "María García López",
    );
  });
  test("falls back to first + last, either half alone", () => {
    expect(
      nameFromDecision({ id_verifications: [{ first_name: "Axel", last_name: "Atarubby" }] }),
    ).toBe("Axel Atarubby");
    expect(nameFromDecision({ id_verifications: [{ first_name: null, last_name: "Solo" }] })).toBe(
      "Solo",
    );
  });
  test("legacy singular object still read", () => {
    expect(nameFromDecision({ id_verification: { full_name: "Old Shape" } })).toBe("Old Shape");
  });
  test("null rather than a guess", () => {
    expect(nameFromDecision(null)).toBeNull();
    expect(nameFromDecision({ id_verifications: [] })).toBeNull();
    expect(nameFromDecision({ id_verifications: [{ full_name: "  " }] })).toBeNull();
  });
});
