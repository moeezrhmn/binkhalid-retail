"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { homePathFor } from "@/lib/auth";
import { db } from "@/lib/db";
import { blockedMinutes, clearFailures, loginLimitKeys, recordFailure } from "@/lib/rate-limit";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = { error?: string; username?: string };

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Enter your username").max(50),
  password: z.string().min(1, "Enter your password").max(200),
});

// Compared against when the username does not exist, so both cases take the same time.
const DUMMY_HASH = bcrypt.hashSync("no-such-user", 12);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  const username = String(formData.get("username") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", username };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const keys = loginLimitKeys(ip, parsed.data.username);

  const wait = blockedMinutes(keys);
  if (wait > 0) {
    return { error: `Too many failed attempts. Try again in ${wait} minute(s).`, username };
  }

  const user = await db.user.findUnique({ where: { username: parsed.data.username } });
  const passwordOk = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk || !user.isActive) {
    recordFailure(keys);
    return { error: "Wrong username or password", username };
  }

  clearFailures(keys);
  await createSession({ uid: user.id, type: user.type });
  redirect(homePathFor({ id: user.id, name: user.name, type: user.type }));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
