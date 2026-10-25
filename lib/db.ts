import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Connection options for every app connection:
 * - TimeZone=UTC: the adapter sends timestamps without a zone, so the session
 *   must be UTC or they are stored shifted (e.g. by +5h on an Asia/Karachi server).
 *   Pakistan-time calculations name the zone explicitly.
 * - search_path: "?schema=" is ignored by the driver, so set it here too, and
 *   hand-written SQL then uses the same schema as Prisma (tests use their own).
 */
export function connectionOptions(connectionString: string | undefined) {
  const schema = connectionString ? new URL(connectionString).searchParams.get("schema") : null;
  const options = ["-c TimeZone=UTC", ...(schema ? [`-c search_path="${schema}"`] : [])].join(" ");
  return { pool: { connectionString, options }, adapter: schema ? { schema } : undefined };
}

export function createClient(connectionString = process.env.DATABASE_URL) {
  const { pool, adapter } = connectionOptions(connectionString);
  return new PrismaClient({ adapter: new PrismaPg(pool, adapter) });
}

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
