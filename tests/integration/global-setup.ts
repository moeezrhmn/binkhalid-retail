import { execSync } from "node:child_process";
import "dotenv/config";

/** Integration tests run in their own Postgres schema, never in the app's data. */
export function testDatabaseUrl(): string {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Set DATABASE_URL (or TEST_DATABASE_URL) to run integration tests");
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.searchParams.set("schema", "test");
  const schema = url.searchParams.get("schema") ?? "";
  if (!schema.startsWith("test")) {
    throw new Error(`Refusing to run integration tests against schema "${schema}"`);
  }
  return url.toString();
}

export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  process.env.DATABASE_URL = url;
}
