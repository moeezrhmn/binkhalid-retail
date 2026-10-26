"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { toResult, type Result } from "@/server/services/errors";
import {
  createUser,
  deleteUser,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/server/services/users";

const id = z.uuid();

async function done(run: () => Promise<unknown>): Promise<Result<null>> {
  const result = await toResult(async () => {
    await run();
    return null;
  });
  revalidatePath("/", "layout");
  return result;
}

export async function createUserAction(input: {
  name: string;
  username: string;
  password: string;
  type: string;
}): Promise<Result<null>> {
  const admin = await requireAdmin();
  return done(() =>
    createUser(
      {
        name: String(input.name),
        username: String(input.username),
        password: String(input.password),
        type: String(input.type),
      },
      admin.id,
    ),
  );
}

export async function updateUserAction(
  userId: string,
  input: { name: string; username: string; type: string },
): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!id.safeParse(userId).success) return { ok: false, error: "Unknown user" };
  return done(() =>
    updateUser(admin.id, userId, {
      name: String(input.name),
      username: String(input.username),
      type: String(input.type),
    }),
  );
}

export async function resetPasswordAction(userId: string, password: string): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!id.safeParse(userId).success) return { ok: false, error: "Unknown user" };
  return done(async () => {
    const { sessionVersion } = await resetPassword(admin.id, userId, String(password));
    // Changing your own password ends your other sessions but keeps this one.
    if (userId === admin.id) await createSession({ uid: admin.id, ver: sessionVersion });
  });
}

export async function setUserActiveAction(
  userId: string,
  isActive: boolean,
): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!id.safeParse(userId).success) return { ok: false, error: "Unknown user" };
  return done(() => setUserActive(admin.id, userId, Boolean(isActive)));
}

export async function deleteUserAction(userId: string): Promise<Result<null>> {
  const admin = await requireAdmin();
  if (!id.safeParse(userId).success) return { ok: false, error: "Unknown user" };
  return done(() => deleteUser(admin.id, userId));
}
