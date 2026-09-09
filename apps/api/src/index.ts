import {
  ACCOUNT_FIELDS,
  balanceOf,
  cardState,
  env,
  formatCtc,
  type IndexedAccount,
  indexer,
  isAddress,
  kycStart,
  kycStatus,
  stakingAdapterState,
} from "./sources";

const port = Number(process.env.PORT ?? 3001);
const now = () => Math.floor(Date.now() / 1000);

/**
 * Read-only by design. Every number here is either read off the chain or
 * off the indexer's copy of it; nothing is scored, signed or moved. The card
 * app asks one question per screen and gets one composed answer.
 */
const server = Bun.serve({
  port,
  routes: {
    "/health": () => Response.json({ ok: true }),

    "/account/:wallet": async (req) => {
      const wallet = req.params.wallet.toLowerCase();
      if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });

      const [kyc, { Account }, balance] = await Promise.all([
        kycStatus(wallet),
        indexer<{ Account: IndexedAccount[] }>(
          `query($id:String!){ Account(where:{id:{_eq:$id}}){ ${ACCOUNT_FIELDS} } }`,
          { id: wallet },
        ),
        balanceOf(wallet),
      ]);
      const account = Account[0] ?? null;
      const card = cardState(kyc, account, now());

      return Response.json({
        wallet,
        kyc,
        balance: { wei: balance.toString(), ctc: formatCtc(balance) },
        credit: account
          ? {
              score: Number(account.score),
              limit: account.creditLimit,
              available: account.available,
              drawn: account.drawn,
              collateral: account.collateral,
              pendingRelease: account.pendingRelease,
              provenNonce: account.provenNonce,
              dueAt: Number(account.dueAt),
              cycleCount: account.cycleCount,
              repayCount: account.repayCount,
              defaultCount: account.defaultCount,
              limitCtc: formatCtc(BigInt(account.creditLimit)),
              availableCtc: formatCtc(BigInt(account.available)),
              drawnCtc: formatCtc(BigInt(account.drawn)),
            }
          : null,
        card: { ...card, spendableCtc: formatCtc(BigInt(card.spendable)) },
      });
    },

    "/account/:wallet/kyc": {
      // Kicks off verification. Status comes back through /account/:wallet
      // once Didit's webhook reaches the KYC service.
      POST: async (req) => {
        const wallet = req.params.wallet.toLowerCase();
        if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });
        return Response.json(await kycStart(wallet));
      },
    },

    "/account/:wallet/activity": async (req) => {
      const wallet = req.params.wallet.toLowerCase();
      if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });

      type Row = { id: string; timestamp: string; txHash: string; blockNumber: string };
      const data = await indexer<{
        Draw: (Row & { amount: string; outstandingAfter: string; dueAt: string })[];
        Repayment: (Row & { amount: string; outstandingAfter: string; settled: boolean })[];
        CollateralLock: (Row & { amount: string; nonce: string; released: boolean })[];
        Default: (Row & { writtenOff: string; collateralSeized: string })[];
      }>(
        `query($id:String!){
          Draw(where:{account_id:{_eq:$id}},order_by:{timestamp:desc},limit:100){ id timestamp txHash blockNumber amount outstandingAfter dueAt }
          Repayment(where:{account_id:{_eq:$id}},order_by:{timestamp:desc},limit:100){ id timestamp txHash blockNumber amount outstandingAfter settled }
          CollateralLock(where:{account_id:{_eq:$id}},order_by:{timestamp:desc},limit:100){ id timestamp txHash blockNumber amount nonce released }
          Default(where:{account_id:{_eq:$id}},order_by:{timestamp:desc},limit:100){ id timestamp txHash blockNumber writtenOff collateralSeized }
        }`,
        { id: wallet },
      );

      const items = [
        ...data.Draw.map((r) => ({ kind: "draw" as const, chain: "creditcoin", ...r })),
        ...data.Repayment.map((r) => ({ kind: "repayment" as const, chain: "creditcoin", ...r })),
        ...data.CollateralLock.map((r) => ({
          kind: r.released ? ("collateral_unlocked" as const) : ("collateral_locked" as const),
          chain: "sepolia",
          ...r,
        })),
        ...data.Default.map((r) => ({ kind: "default" as const, chain: "creditcoin", ...r })),
      ].sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

      return Response.json({ wallet, items });
    },

    "/protocol": async () => {
      const [{ Protocol, YieldPosition }, adapter, poolBalance] = await Promise.all([
        indexer<{
          Protocol: {
            accounts: number;
            totalCollateral: string;
            outstanding: string;
            lifetimeDrawn: string;
            lifetimeRepaid: string;
            lifetimeDefaulted: string;
            defaultCount: number;
          }[];
          YieldPosition: {
            deployedPrincipal: string;
            accruedRewards: string;
            totalDelegated: string;
            totalReturned: string;
            lastUpdatedAt: string;
          }[];
        }>(
          "{ Protocol { accounts totalCollateral outstanding lifetimeDrawn lifetimeRepaid lifetimeDefaulted defaultCount } YieldPosition { deployedPrincipal accruedRewards totalDelegated totalReturned lastUpdatedAt } }",
        ),
        stakingAdapterState(),
        balanceOf(env.creditLine),
      ]);
      const position = YieldPosition[0];

      return Response.json({
        protocol: Protocol[0] ?? null,
        liquidity: {
          // What the credit line can pay out right now, before touching the adapter.
          poolWei: poolBalance.toString(),
          poolCtc: formatCtc(poolBalance),
        },
        staking: {
          adapter: env.stakingAdapter,
          bondedWei: position?.deployedPrincipal ?? "0",
          bondedCtc: formatCtc(BigInt(position?.deployedPrincipal ?? 0)),
          rewardsWei: position?.accruedRewards ?? "0",
          rewardsCtc: formatCtc(BigInt(position?.accruedRewards ?? 0)),
          idleWei: adapter.idle.toString(),
          idleCtc: formatCtc(adapter.idle),
          totalAssetsWei: adapter.totalAssets.toString(),
          totalAssetsCtc: formatCtc(adapter.totalAssets),
          lifetimeDelegatedWei: position?.totalDelegated ?? "0",
          lifetimeReturnedWei: position?.totalReturned ?? "0",
          lastUpdatedAt: Number(position?.lastUpdatedAt ?? 0),
        },
      });
    },
  },
  error: (err) => {
    console.error(err);
    return Response.json({ error: "upstream unavailable" }, { status: 502 });
  },
  fetch: () => new Response("not found", { status: 404 }),
});

console.log(`comacard api on :${server.port}`);
