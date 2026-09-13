import type { NextConfig } from "next";

/**
 * The pages read markdown from elsewhere in the repository at build time, so the tracing root has
 * to be the repository rather than this directory. Without it Next warns about a lockfile it cannot
 * place and, on a standalone build, leaves the sources out of the output entirely.
 */
const nextConfig: NextConfig = {
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,
};

export default nextConfig;
