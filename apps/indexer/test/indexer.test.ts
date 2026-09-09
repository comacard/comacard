import { expect, test } from "bun:test";
import { createTestIndexer } from "envio";
import "../src/handlers/CreditLine";
import "../src/handlers/SourceVault";
import "../src/handlers/StakingAdapter";

/**
 * Runs the handlers over the real Creditcoin CC3 blocks holding the deployment
 * and the first liquidity moves.
 *
 * Opt-in, because it needs two things CI does not have: the network, and a
 * Postgres for Envio's local runtime (`docker compose up` in this directory, or
 * any Postgres on the default port). Without the database it hangs rather than
 * failing, which is why the timeout is explicit.
 *
 *   bun run test:live
 */
const live = process.env.INDEXER_LIVE_TEST === "1";

test.skipIf(!live)(
  "indexes the live Creditcoin deployment",
  async () => {
    const indexer = createTestIndexer();

    const { changes } = await indexer.process({
      chains: { 102031: { startBlock: 5458366, endBlock: 5458600 } },
    });

    expect(changes.length).toBeGreaterThan(0);

    const position = await indexer.YieldPosition.get("ctc-staking-adapter");
    if (position) {
      // whatever the operator did, principal never exceeds what was delegated
      expect(position.deployedPrincipal).toBeLessThanOrEqual(position.totalDelegated);
    }
  },
  120_000,
);
