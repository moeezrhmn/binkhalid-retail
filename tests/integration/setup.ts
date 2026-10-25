import { afterAll, beforeEach } from "vitest";
import { testDatabaseUrl } from "./global-setup";

process.env.DATABASE_URL = testDatabaseUrl();

const { db } = await import("@/lib/db");

const schema = new URL(process.env.DATABASE_URL).searchParams.get("schema")!;

/** Empties every table in the test schema before each test. */
beforeEach(async () => {
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> '_prisma_migrations'`,
    schema,
  );
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${schema}"."${tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await db.$disconnect();
});
