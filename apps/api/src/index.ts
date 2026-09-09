import { formatIdr, profileFrom } from "@comacard/core";

const port = Number(process.env.PORT ?? 3001);

/**
 * Deliberately thin: the API derives limits from already-attested events, but
 * never holds custody and never signs. Anything that moves value goes on chain.
 */
const server = Bun.serve({
  port,
  routes: {
    "/health": () => Response.json({ ok: true }),

    "/credit/profile": {
      POST: async (req) => {
        const body = (await req.json()) as { events?: unknown; collateral?: string };
        if (!Array.isArray(body.events) || typeof body.collateral !== "string") {
          return Response.json(
            { error: "expected { events: AttestedEvent[], collateral: string }" },
            { status: 400 },
          );
        }
        try {
          const profile = profileFrom(
            body.events as Parameters<typeof profileFrom>[0],
            BigInt(body.collateral),
            Math.floor(Date.now() / 1000),
          );
          return Response.json({
            score: profile.score,
            collateralizationRatio: profile.collateralizationRatio,
            limit: profile.limit.toString(),
            limitFormatted: formatIdr(profile.limit),
          });
        } catch (err) {
          return Response.json({ error: (err as Error).message }, { status: 422 });
        }
      },
    },
  },
  fetch: () => new Response("not found", { status: 404 }),
});

console.log(`comacard api on :${server.port}`);
