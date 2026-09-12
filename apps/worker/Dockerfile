# Build context is the repository root.
#
# Unlike api and kyc, this service has real dependencies (ethers, the Gluwa SDK)
# and a workspace one, so it installs. The whole repo comes in because Bun
# resolves a workspace install against every member's manifest, and copying a
# subset makes the shape disagree with the lockfile.
FROM oven/bun:1.3-slim
WORKDIR /app
COPY . .
RUN bun install --filter @comacard/worker
ENV NODE_ENV=production
# No HTTP surface: this is a poll loop, not a server.
CMD ["bun", "apps/worker/src/index.ts"]
