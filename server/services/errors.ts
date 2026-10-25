import { Prisma } from "@/generated/prisma/client";

/** An error whose message is safe and useful to show to the admin. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a service call for a server action: user errors become messages, anything else is rethrown. */
export async function toResult<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    throw error;
  }
}
