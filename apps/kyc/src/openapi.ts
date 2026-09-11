/** Hand-written and small on purpose: three routes do not justify a generator. */
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Comacard KYC",
    version: "0.1.0",
    description:
      "Identity verification for Comacard wallets, backed by Didit. Start a session, send the user to the returned URL, and read the outcome back per wallet once Didit's webhook lands.",
  },
  paths: {
    "/health": {
      get: { summary: "Liveness", responses: { "200": { description: "ok" } } },
    },
    "/kyc/session": {
      post: {
        summary: "Start (or resume) a verification session for a wallet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["wallet"],
                properties: { wallet: { $ref: "#/components/schemas/Address" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session created. Open `url` in the user's browser.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionId: { type: "string", format: "uuid" },
                    url: { type: "string", format: "uri" },
                  },
                },
              },
            },
          },
          "400": { description: "wallet is not a 0x address" },
          "502": { description: "Didit unavailable" },
        },
      },
    },
    "/kyc/status/{wallet}": {
      get: {
        summary: "Latest verification status for a wallet",
        parameters: [
          {
            name: "wallet",
            in: "path",
            required: true,
            schema: { $ref: "#/components/schemas/Address" },
          },
        ],
        responses: {
          "200": {
            description: "Status. `none` when the wallet has never started KYC.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/KycStatus" } },
            },
          },
          "400": { description: "wallet is not a 0x address" },
        },
      },
    },
    "/kyc/webhook": {
      post: {
        summary: "Didit webhook intake (called by Didit, not by clients)",
        description:
          "Verifies `X-Signature-V2` over canonical JSON, falling back to `X-Signature` over the raw body, with a 5 minute `X-Timestamp` window. Every accepted delivery is stored verbatim and applied idempotently.",
        parameters: [
          { name: "X-Signature-V2", in: "header", schema: { type: "string" } },
          { name: "X-Signature", in: "header", schema: { type: "string" } },
          { name: "X-Timestamp", in: "header", required: true, schema: { type: "string" } },
        ],
        requestBody: { content: { "application/json": { schema: { type: "object" } } } },
        responses: {
          "200": { description: "`ok`, `stored`, `duplicate` or `ignored`" },
          "400": { description: "unparseable payload" },
          "401": { description: "signature or timestamp rejected" },
        },
      },
    },
  },
  components: {
    schemas: {
      Address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$", example: "0xabc…" },
      KycStatus: {
        type: "object",
        properties: {
          wallet: { $ref: "#/components/schemas/Address" },
          sessionId: { type: "string", nullable: true },
          status: {
            type: "string",
            description: "Didit session status verbatim, or `none`",
            example: "Approved",
          },
          verified: { type: "boolean", description: "true only when status is Approved" },
          name: {
            type: "string",
            nullable: true,
            description:
              "Name OCR'd from the identity document, read out of the stored decision. Null until a decision exists or when it carries no readable name.",
            example: "María García López",
          },
          updatedAt: { type: "integer", nullable: true, description: "unix seconds" },
        },
      },
    },
  },
} as const;

/** Swagger UI from cdnjs; the page is static so nothing here needs a build step. */
export const docsHtml = (specUrl: string) => `<!doctype html><html><head>
<meta charset="utf-8"><title>${openapi.info.title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css">
</head><body><div id="ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui-bundle.min.js"></script>
<script>SwaggerUIBundle({url:"${specUrl}",dom_id:"#ui"})</script>
</body></html>`;
