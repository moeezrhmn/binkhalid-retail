import "server-only";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { isUniqueViolation, UserError } from "./errors";

const USERNAME = /^[a-z0-9._-]{3,30}$/;

function checkPassword(password: string) {
  if (password.length < 6 || password.length > 100) {
    throw new UserError("The password must be at least 6 characters");
  }
}

export async function listUsers() {
  return db.user.findMany({
    orderBy: [{ type: "asc" }, { isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, username: true, type: true, isActive: true, createdAt: true },
  });
}

export async function createStaff(input: { name: string; username: string; password: string }) {
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  if (!name || name.length > 60) throw new UserError("Enter the staff member's name");
  if (!USERNAME.test(username)) {
    throw new UserError("Username: 3-30 lowercase letters, digits, dots, dashes or underscores");
  }
  checkPassword(input.password);
  try {
    return await db.user.create({
      data: { name, username, type: "STAFF", passwordHash: await bcrypt.hash(input.password, 12) },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(`The username "${username}" is taken`);
    throw error;
  }
}

export async function resetPassword(userId: string, password: string) {
  checkPassword(password);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("This user no longer exists");
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });
}

/** Staff are deactivated, never deleted, because their sales point to them. */
export async function setStaffActive(userId: string, isActive: boolean) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("This user no longer exists");
  if (user.type === "ADMIN") throw new UserError("The admin account cannot be deactivated");
  await db.user.update({ where: { id: userId }, data: { isActive } });
}
