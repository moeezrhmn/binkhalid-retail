import { fileURLToPath } from "node:url";

/** Path aliases shared by the unit and integration test configs. */
export const alias = {
  "@": fileURLToPath(new URL(".", import.meta.url)),
  "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
};
