import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // tsconfig maps `@/*` to the app root and Next honours that, but vitest resolves imports
      // itself and does not read tsconfig paths. Without this, any test that reaches a file using
      // the alias — the vendored beUI card-folder does — fails to resolve rather than to assert.
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright owns `e2e/`; vitest's default include would otherwise match its .spec.ts files.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
