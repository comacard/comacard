import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["tendentiously-impalpable-dede.ngrok-free.dev"],

  /**
   * `@x402/core`, `@x402/evm` and `@x402/svm` are direct dependencies for one reason: nothing in
   * this app imports them. `@wagmi/connectors` reaches `@coinbase/cdp-sdk` through its Base Account
   * connector, and that SDK imports all three. The bundler resolves them statically even though the
   * app can never execute a Base Account payment, and an unresolved one fails the whole graph,
   * returning 500 on EVERY route. They are cheaper than the alternatives: stubbing them out removed
   * Coinbase Wallet from the connect modal.
   *
   * The webpack branch only matters under `next build --webpack`; Next 16 uses Turbopack by
   * default. pino-pretty, lokijs and encoding are optional deps the WalletConnect stack probes for
   * and does not need.
   */
  // Next 16 refuses to start with a `webpack` key and no `turbopack` key, on the grounds that it
  // is usually an unmigrated config. Nothing here needs configuring under Turbopack, so an empty
  // object is the whole migration.
  turbopack: {},

  webpack: (config) => {
    config.externals = config.externals ?? [];
    if (Array.isArray(config.externals)) config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
