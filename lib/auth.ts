import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { readSession } from "./session";
import { sessionIsCurrent } from "./session-rules";

export type CurrentUser = { id: string; name: string; type: "ADMIN" | "STAFF" };

/**
 * The logged-in user, checked against the database on every request: a
 * deactivated account, or one whose sessions were ended (password reset, role
 * change), loses access immediately. The role always comes from the database.
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.uid },
    select: { id: true, name: true, type: true, isActive: true, sessionVersion: true },
  });
  if (!sessionIsCurrent(user, session)) return null;

  return { id: user!.id, name: user!.name, type: user!.type };
});

/** Use in every page, server action and route handler that needs a login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use in every admin-only page, server action and route handler. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.type !== "ADMIN") redirect("/pos");
  return user;
}

export function homePathFor(user: CurrentUser): string {
  return user.type === "ADMIN" ? "/dashboard" : "/pos";
}
