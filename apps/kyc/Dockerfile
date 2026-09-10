# Build context is the repository root. No install step: this service has no
# runtime dependencies beyond what Bun ships with.
FROM oven/bun:1.3-slim
WORKDIR /app
COPY apps/kyc/src ./src
ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]
