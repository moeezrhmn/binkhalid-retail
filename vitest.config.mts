import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Fast unit tests with no database. Integration tests: vitest.integration.config.mts.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
});
