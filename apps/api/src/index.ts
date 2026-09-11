import { issueCard } from "./card";
import { docsHtml, openapi } from "./openapi";
import { cardState, formatCtc, isAddress } from "./shape";
import {
  ACCOUNT_FIELDS,
  balanceOf,
  collateralPrice,
  env,
  type IndexedAccount,
  indexer,
  kycStart,
  kycStatus,
  liveCredit,
  stakingAdapterState,
} from "./sources";

const port = Number(process.env.PORT ?? 3001);
const now = () => Math.floor(Date.now() / 1000);

/** The app runs on another origin, so every answer carries CORS headers. */
const allowed = env.corsOrigin.split(",").map((o) => o.trim());
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : "";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "origin",
  };
}
function withCors(req: Request, res: Response): Response {
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
}

/**
 * Read-only by design. Every number here is either read off the chain or
 * off the indexer's copy of it; nothing is scored, signed or moved. The card
 * app asks one question per screen and gets one composed answer.
 */
type Handler = (req: Request & { params: { wallet: string } }) => Response | Promise<Response>;

const routes: Record<string, Handler | Record<string, Handler>> = {
  "/health": () => Response.json({ ok: true }),
  "/openapi.json": () => Response.json(openapi),
  "/docs": () =>
    new Response(docsHtml("/openapi.json"), { headers: { "content-type": "text/html" } }),

  "/account/:wallet": async (req) => {
    const wallet = req.params.wallet.toLowerCase();
    if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });

    const [kyc, { Account }, balance, live] = await Promise.all([
      kycStatus(wallet),
      indexer<{ Account: IndexedAccount[] }>(
        `query($id:String!){ Account(where:{id:{_eq:$id}}){ ${ACCOUNT_FIELDS} } }`,
        { id: wallet },
      ),
      balanceOf(wallet),
      liveCredit(wallet),
    ]);
    const account = Account[0] ?? null;
    const card = cardState(kyc, account, live.available, now());
    const issued = kyc.verified ? issueCard(wallet, kyc.updatedAt ?? now(), env.cardSecret) : null;

    return Response.json({
      wallet,
      kyc,
      balance: { wei: balance.toString(), ctc: formatCtc(balance) },
      credit: account
        ? {
            score: Number(account.score),
            // Live off the contract; the indexer's copy lags a repricing.
            limit: live.limit.toString(),
            available: live.available.toString(),
            drawn: account.drawn,
            collateral: account.collateral,
            pendingRelease: account.pendingRelease,
            provenNonce: account.provenNonce,
            dueAt: Number(account.dueAt),
            cycleCount: account.cycleCount,
            repayCount: account.repayCount,
            defaultCount: account.defaultCount,
            limitCtc: formatCtc(live.limit),
            availableCtc: formatCtc(live.available),
            drawnCtc: formatCtc(BigInt(account.drawn)),
          }
        : null,
      card: {
        ...card,
        spendableCtc: formatCtc(BigInt(card.spendable)),
        issued: issued !== null,
        // The name Didit read off the document, not one the user typed. Null
        // leaves the card blank rather than inventing a holder.
        holder: kyc.name,
        // Full PAN and CVV only through /account/:wallet/card, on purpose.
        number: issued?.masked ?? null,
        accountNumber: issued?.accountNumber ?? null,
        expiry: issued?.expiry ?? null,
        issuedAt: issued?.issuedAt ?? null,
      },
    });
  },

  "/account/:wallet/card": async (req) => {
    const wallet = req.params.wallet.toLowerCase();
    if (!isAddress(wallet)) return Response.json({ error: "bad wallet" }, { status: 400 });

    const [kyc, { Account }, live] = await Promise.all([
      kycStatus(wallet),
      indexer<{ Account: IndexedAccount[] }>(
        `query($id:String!){ Account(where:{id:{_eq:$id}}){ ${ACCOUNT_FIELDS} } }`,
        { id: wallet },
      ),
      liveCredit(wallet),
    ]);
    if (!kyc.verified) {
      return Response.json({ error: "no card: identity not verified" }, { status: 404 });
    }
    const state = cardState(kyc, Account[0] ?? null, live.available, now());
    const card = issueCard(wallet, kyc.updatedAt ?? now(), env.cardSecret);
    return Response.json({
      wallet,
      holder: kyc.name,
      ...card,
      active: state.active,
      reason: state.active ? undefined : state.reason,
      spendable: state.spendable,
      spendableCtc: formatCtc(BigInt(state.spendable)),
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
    const [{ Protocol, YieldPosition }, adapter, poolBalance, price] = await Promise.all([
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
      collateralPrice(),
    ]);
    const position = YieldPosition[0];

    return Response.json({
      protocol: Protocol[0] ?? null,
      // What one ETH of collateral is worth in CTC, 18dp, live off the contract.
      collateralPrice: { wei: price.toString(), ctcPerEth: formatCtc(price) },
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
};

const withCorsHandler =
  (h: Handler): Handler =>
  async (req) =>
    withCors(req, await h(req));
const preflight = (req: Request) => withCors(req, new Response(null, { status: 204 }));

/** Every route answers OPTIONS and carries CORS headers, without repeating it per handler. */
const corsRoutes = Object.fromEntries(
  Object.entries(routes).map(([path, route]) => {
    const byMethod: Record<string, Handler> =
      typeof route === "function"
        ? { GET: route as Handler }
        : Object.fromEntries(Object.entries(route).map(([m, h]) => [m, h as Handler]));
    const wrapped = Object.fromEntries(
      Object.entries(byMethod).map(([m, h]) => [m, withCorsHandler(h)]),
    );
    return [path, { OPTIONS: preflight, ...wrapped }];
  }),
);

const server = Bun.serve({
  port,
  routes: corsRoutes,
  error: (err) => {
    console.error(err);
    return Response.json(
      { error: "upstream unavailable" },
      {
        status: 502,
        headers: {
          "access-control-allow-origin": allowed.includes("*") ? "*" : (allowed[0] ?? ""),
        },
      },
    );
  },
  fetch: (req) => withCors(req, new Response("not found", { status: 404 })),
});

console.log(`comacard api on :${server.port}`);
