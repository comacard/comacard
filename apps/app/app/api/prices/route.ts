import { COINGECKO_IDS, type PricedSymbol, type UsdPrices } from "../../../lib/comacard/prices";

/**
 * One CoinGecko call per hour for everybody, instead of one per visitor per page load.
 *
 * The keyless CoinGecko API allows roughly ten to thirty calls a minute against the caller's IP and
 * documents itself as unsuitable for scheduled polling. Fetching from the browser would spend that
 * budget on every mount of every screen, and a demo with a few people watching would sit on 429s.
 * Going through the server means one caller, one cache, and a number that is the same for everyone
 * looking at the same screen.
 *
 * **Next's Data Cache is the Redis here.** `revalidate` on the outbound fetch is a shared, timed
 * cache maintained by the framework, which is the thing a Redis entry would have been. Adding an
 * actual Redis would mean another service to run, another URL in the environment, and another
 * component that can be down, in exchange for behaviour this already has. If the app ever needs a
 * cache shared across separately deployed instances, that is the moment to revisit it.
 *
 * **The last good answer is kept and served when CoinGecko does not answer.** Prices are decoration
 * here rather than an input to anything financial, so an hour-old figure is worth more than a blank
 * where a number should be. It is unlabelled on purpose: Axel asked for a snapshot rather than a
 * live feed, and stamping "as of 13:05" on a decorative figure draws the eye to the least important
 * thing on the screen. Nothing is invented, though. Before a first successful fetch this returns an
 * empty object and every caller falls back to tCTC.
 */

/** One hour. Long enough to stay far inside the rate limit, short enough to not be yesterday. */
const REVALIDATE_SECONDS = 3600;

/**
 * The last good answer, per server process.
 *
 * Module scope, so it survives requests but not a deploy. That is the correct lifetime: a fresh
 * process with no snapshot and a failing CoinGecko should say "no prices" and let the screens show
 * tCTC, rather than serve a figure baked into the bundle at build time and present it as today's.
 */
let snapshot: UsdPrices = {};

const ENDPOINT =
  "https://api.coingecko.com/api/v3/simple/price" +
  `?ids=${Object.values(COINGECKO_IDS).join(",")}&vs_currencies=usd`;

export async function GET(): Promise<Response> {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { accept: "application/json" },
      // Documented: sending an API key header to the keyless API is ignored, so none is sent.
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) throw new Error(`coingecko ${response.status}`);

    const body = (await response.json()) as Record<string, { usd?: number }>;
    const fresh: UsdPrices = {};
    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      const usd = body[id]?.usd;
      // A price of zero is not a price. Letting one through would render every holding as $0.00,
      // which is a claim about someone's money rather than a missing figure.
      if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
        fresh[symbol as PricedSymbol] = usd;
      }
    }

    // Merged rather than replaced, so one coin missing from a response does not drop a price that
    // was known a minute ago.
    if (Object.keys(fresh).length > 0) snapshot = { ...snapshot, ...fresh };
  } catch {
    // Rate limited, offline, or malformed. The snapshot below is the answer, and an empty one is a
    // perfectly good answer that means "show tCTC".
  }

  return Response.json(snapshot, {
    headers: {
      // The browser may hold it for an hour and keep showing the old one for a day while a new one
      // is fetched behind it. Prices here are decorative; a stale-while-revalidate is exactly the
      // trade this wants.
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
