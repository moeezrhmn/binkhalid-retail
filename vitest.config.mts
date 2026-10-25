import { defineConfig } from "vitest/config";
import { alias } from "./vitest.alias";

// Fast unit tests with no database. Integration tests: vitest.integration.config.mts.
export default defineConfig({
  resolve: { alias },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**"],
    environment: "node",
  },
});
