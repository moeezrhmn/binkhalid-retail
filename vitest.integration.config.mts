import { defineConfig } from "vitest/config";
import { alias } from "./vitest.alias";

// Tests that need a real database, in a separate "test" schema. Run with `npm run test:db`.
export default defineConfig({
  resolve: { alias },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
