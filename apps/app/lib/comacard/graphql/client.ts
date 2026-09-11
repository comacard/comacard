/**
 * Transport for the Envio indexer's GraphQL endpoint.
 *
 * This exists next to `lib/comacard/api.ts`, not instead of it, and the split is not arbitrary.
 * `apps/api` is the read surface for *state*: what the card is, what the limit is right now, read
 * live off the contract. The indexer is the read surface for *history and proofs*: the Attestation
 * rows that say a collateral lock has finished crossing from Sepolia to Creditcoin. The API exposes
 * no Attestation route, and that crossing is the one step in this product with a seven to nine
 * minute wait, so the screen that waits on it has to watch the indexer directly.
 *
 * Same disciplines as the REST client: never throws, env-gated, amounts stay strings.
 */

import type { Result } from "../api";

const RAW_URL = process.env.NEXT_PUBLIC_INDEXER_URL ?? "";

/** Envio Cloud gives every deployment its own URL, so this moves whenever main does. */
export const INDEXER_URL = RAW_URL.replace(/\/+$/, "");

export const indexerEnabled = (): boolean => INDEXER_URL !== "";

const TIMEOUT_MS = 10_000;

type GraphQLBody<T> = { data?: T; errors?: { message: string }[] };

export async function query<T>(
  document: string,
  variables: Record<string, unknown> = {},
): Promise<Result<T>> {
  if (!indexerEnabled()) {
    return { ok: false, code: "disabled", message: "NEXT_PUBLIC_INDEXER_URL is not set" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(INDEXER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: document, variables }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, code: "http", message: `indexer ${res.status}` };
    const body = (await res.json().catch(() => null)) as GraphQLBody<T> | null;
    if (!body) return { ok: false, code: "parse", message: "response was not JSON" };
    // GraphQL reports failure inside a 200, so the status alone proves nothing.
    if (body.errors?.length) {
      return { ok: false, code: "graphql", message: body.errors[0]?.message ?? "query failed" };
    }
    if (!body.data) return { ok: false, code: "parse", message: "response carried no data" };
    return { ok: true, value: body.data };
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "timeout" : "unavailable",
      message: aborted ? "the indexer did not answer in time" : "could not reach the indexer",
    };
  } finally {
    clearTimeout(timer);
  }
}
