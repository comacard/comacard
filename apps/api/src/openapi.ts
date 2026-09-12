/** Hand-written and small on purpose: four routes do not justify a generator. */
const Address = { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", example: "0xabc…" } as const;
const Wei = { type: "string", description: "uint256 as a decimal string (wei)" } as const;
const walletParam = { name: "wallet", in: "path", required: true, schema: Address } as const;

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Comacard API",
    version: "0.1.0",
    description:
      "Read-only backend for the card app. Composes the indexer (credit state), the KYC service and Creditcoin RPC into one answer per wallet. Nothing here scores, signs or moves value; draws and repayments go straight to ASCCreditLine.",
  },
  paths: {
    "/health": {
      get: { summary: "Liveness", responses: { "200": { description: "ok" } } },
    },
    "/account/{wallet}": {
      get: {
        summary: "Everything the card screen needs for one wallet",
        parameters: [walletParam],
        responses: {
          "200": {
            description: "Composed view",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Account" } } },
          },
          "400": { description: "wallet is not a 0x address" },
          "502": { description: "indexer, KYC or RPC unavailable" },
        },
      },
    },
    "/account/{wallet}/kyc": {
      post: {
        summary: "Start KYC for a wallet",
        description:
          "Proxies to the KYC service. Open the returned URL; the outcome shows up in `GET /account/{wallet}` once Didit's webhook lands.",
        parameters: [walletParam],
        responses: {
          "200": {
            description: "Session",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionId: { type: "string" },
                    url: { type: "string", format: "uri" },
                  },
                },
              },
            },
          },
          "400": { description: "wallet is not a 0x address" },
          "502": { description: "KYC service unavailable" },
        },
      },
    },
    "/account/{wallet}/card": {
      get: {
        summary: "The wallet's card: full number, account number, CVV, expiry",
        description:
          "Exists as soon as KYC is Approved; nothing has to be requested. Treat the response as sensitive.",
        parameters: [walletParam],
        responses: {
          "200": {
            description: "Issued card",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/IssuedCard" } },
            },
          },
          "400": { description: "wallet is not a 0x address" },
          "404": { description: "identity not verified, so no card exists yet" },
          "502": { description: "KYC service or indexer unavailable" },
        },
      },
    },
    "/account/{wallet}/activity": {
      get: {
        summary: "Draws, repayments, collateral locks and defaults, newest first",
        parameters: [walletParam],
        responses: {
          "200": {
            description: "Up to 100 of each kind, merged",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    wallet: Address,
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ActivityItem" },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "wallet is not a 0x address" },
        },
      },
    },
    "/protocol": {
      get: {
        summary: "Pool liquidity and the CTC staking position",
        responses: {
          "200": {
            description:
              "Protocol totals from the indexer; idle and totalAssets read live off the adapter",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Protocol" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Address,
      Wei,
      KycStatus: {
        type: "object",
        properties: {
          status: { type: "string", example: "Approved" },
          verified: { type: "boolean" },
          sessionId: { type: "string", nullable: true },
          name: {
            type: "string",
            nullable: true,
            description: "holder name from the identity document",
          },
          updatedAt: { type: "integer", nullable: true, description: "unix seconds" },
        },
      },
      Credit: {
        type: "object",
        nullable: true,
        description: "null until the wallet has been seen by the indexer",
        properties: {
          score: { type: "integer", minimum: 0, maximum: 100 },
          limit: { ...Wei, description: "live from ASCCreditLine.limitOf, not the indexer" },
          available: { ...Wei, description: "live from ASCCreditLine.availableOf" },
          drawn: Wei,
          collateral: Wei,
          pendingRelease: Wei,
          provenNonce: { type: "string" },
          dueAt: { type: "integer", description: "unix seconds, 0 when nothing drawn" },
          cycleCount: { type: "integer" },
          repayCount: { type: "integer" },
          defaultCount: { type: "integer" },
          limitCtc: { type: "string", example: "0.0066" },
          availableCtc: { type: "string" },
          drawnCtc: { type: "string" },
        },
      },
      Card: {
        type: "object",
        description:
          "Issued the moment KYC is Approved. Numbers are derived from the wallet, so they never change. The full PAN and CVV are only returned by /account/{wallet}/card.",
        properties: {
          active: { type: "boolean" },
          issued: { type: "boolean" },
          holder: {
            type: "string",
            nullable: true,
            description:
              "Legal name as OCR'd from the identity document by Didit; never typed by the user",
          },
          spendable: Wei,
          spendableCtc: { type: "string" },
          reason: {
            type: "string",
            enum: ["kyc_required", "overdue"],
            description: "present only when active is false",
          },
          number: { type: "string", nullable: true, example: "•••• •••• •••• 4821" },
          accountNumber: { type: "string", nullable: true, example: "482193027465" },
          expiry: { type: "string", nullable: true, example: "09/30" },
          issuedAt: { type: "integer", nullable: true, description: "unix seconds" },
        },
      },
      IssuedCard: {
        type: "object",
        properties: {
          wallet: Address,
          holder: {
            type: "string",
            nullable: true,
            description:
              "Legal name as OCR'd from the identity document by Didit; never typed by the user",
          },
          number: { type: "string", description: "16 digits, Luhn-valid, private BIN 9924" },
          masked: { type: "string" },
          accountNumber: { type: "string", description: "12 digits" },
          cvv: { type: "string", description: "3 digits" },
          expiry: { type: "string", example: "09/30" },
          expiresAt: { type: "integer" },
          issuedAt: { type: "integer" },
          active: { type: "boolean" },
          reason: {
            type: "string",
            enum: ["overdue"],
            description: "present only when active is false",
          },
          spendable: Wei,
          spendableCtc: { type: "string" },
        },
      },
      RemoteDeposit: {
        type: "object",
        description:
          "A deposit locked on another chain. Wormhole guardians sign at finalized consistency, so `credited` stays false for minutes while the funds sit in the far vault and the limit has not moved.",
        properties: {
          id: { type: "string", example: "10004-7" },
          chain: { type: "string", example: "Base Sepolia" },
          wormholeChainId: {
            type: "integer",
            description:
              "Wormhole's own id, unrelated to the EVM chain id. 10004 Base Sepolia, 10003 Arbitrum Sepolia.",
          },
          token: { type: "string", description: "zero address for the native coin" },
          decimals: { type: "integer" },
          amount: { type: "string", description: "base units of the asset's own decimals" },
          amountFormatted: { type: "string", example: "50.0000" },
          sequence: { type: "string" },
          credited: { type: "boolean", description: "false means still in flight" },
          lockedAt: { type: "integer" },
          lockTxHash: { type: "string" },
          lockTxUrl: { type: "string", nullable: true },
          creditedAt: { type: "integer", nullable: true },
          creditTxHash: { type: "string", nullable: true },
          creditTxUrl: { type: "string", nullable: true },
          elapsedSeconds: { type: "integer" },
          waitSeconds: { type: "integer", description: "nominal guardian signing time" },
          slow: {
            type: "boolean",
            description: "still waiting and past the nominal time; not a failure",
          },
        },
      },
      Account: {
        type: "object",
        properties: {
          wallet: Address,
          kyc: { $ref: "#/components/schemas/KycStatus" },
          balance: {
            type: "object",
            properties: { wei: Wei, ctc: { type: "string", example: "9939.9774" } },
          },
          credit: { $ref: "#/components/schemas/Credit" },
          pendingDeposits: {
            type: "array",
            description:
              "Cross-chain deposits still in flight. Show these as pending: the user has deposited and the limit has not moved yet, which reads as a bug otherwise.",
            items: { $ref: "#/components/schemas/RemoteDeposit" },
          },
          card: { $ref: "#/components/schemas/Card" },
        },
      },
      ActivityItem: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "draw",
              "repayment",
              "collateral_locked",
              "collateral_unlocked",
              "default",
              "remote_deposit",
            ],
          },
          chain: { type: "string", description: "display name", example: "Base Sepolia" },
          txUrl: { type: "string", nullable: true, description: "explorer link for this chain" },
          pending: { type: "boolean", description: "remote_deposit only: not yet delivered" },
          id: { type: "string" },
          timestamp: { type: "string" },
          txHash: { type: "string" },
          blockNumber: { type: "string" },
          amount: Wei,
        },
        additionalProperties: true,
      },
      Protocol: {
        type: "object",
        properties: {
          protocol: {
            type: "object",
            nullable: true,
            properties: {
              accounts: { type: "integer" },
              totalCollateral: Wei,
              outstanding: Wei,
              lifetimeDrawn: Wei,
              lifetimeRepaid: Wei,
              lifetimeDefaulted: Wei,
              defaultCount: { type: "integer" },
            },
          },
          collateralPrice: {
            type: "object",
            description: "What one ETH of collateral is worth in CTC, live off the contract",
            properties: { wei: Wei, ctcPerEth: { type: "string", example: "1000.0000" } },
          },
          liquidity: { type: "object", properties: { poolWei: Wei, poolCtc: { type: "string" } } },
          staking: {
            type: "object",
            properties: {
              adapter: Address,
              bondedWei: Wei,
              bondedCtc: { type: "string" },
              rewardsWei: Wei,
              rewardsCtc: { type: "string" },
              idleWei: Wei,
              idleCtc: { type: "string" },
              totalAssetsWei: Wei,
              totalAssetsCtc: { type: "string" },
              lifetimeDelegatedWei: Wei,
              lifetimeReturnedWei: Wei,
              lastUpdatedAt: { type: "integer" },
            },
          },
        },
      },
    },
  },
} as const;

export const docsHtml = (specUrl: string) => `<!doctype html><html><head>
<meta charset="utf-8"><title>${openapi.info.title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
</head><body><div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:"${specUrl}",dom_id:"#ui"})</script>
</body></html>`;
