import "server-only";
import bcrypt from "bcryptjs";
import type { Prisma, UserType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/roles";
import { isUniqueViolation, UserError } from "./errors";

type Tx = Prisma.TransactionClient;

const USERNAME = /^[a-z0-9._-]{3,30}$/;

// Changes that could remove the last admin take this lock, so two admins
// acting at the same moment cannot both demote each other.
const ADMIN_LOCK = 4_310_002;

function checkPassword(password: string) {
  if (password.length < 6 || password.length > 100) {
    throw new UserError("The password must be at least 6 characters");
  }
}

function checkRole(type: string): asserts type is UserType {
  if (type !== "ADMIN" && type !== "STAFF") throw new UserError("Pick a role");
}

function cleanIdentity(input: { name: string; username: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const username = input.username.trim().toLowerCase();
  if (!name || name.length > 60) throw new UserError("Enter the person's name");
  if (!USERNAME.test(username)) {
    throw new UserError("Username: 3-30 lowercase letters, digits, dots, dashes or underscores");
  }
  return { name, username };
}

async function lockAdmins(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_LOCK})`;
}

/** Throws if `userId` is the only active admin and is about to stop being one. */
async function keepOneAdmin(tx: Tx, userId: string, action: string) {
  const others = await tx.user.count({
    where: { type: "ADMIN", isActive: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new UserError(
      `This is the only active admin, so it cannot be ${action}. Make another admin first.`,
    );
  }
}

/** The first admin, created at setup, has no creator. It always remains. */
export function isDefaultAdmin(user: { type: UserType; createdById: string | null }) {
  return user.type === "ADMIN" && user.createdById === null;
}

/** Only the default admin may change its own password, name or username. */
function onlyDefaultAdminItself(
  user: { id: string; type: UserType; createdById: string | null },
  actorId: string,
) {
  if (isDefaultAdmin(user) && user.id !== actorId) {
    throw new UserError("Only the default admin can change its own name, username or password.");
  }
}

function protectDefaultAdmin(user: { type: UserType; createdById: string | null }, action: string) {
  if (isDefaultAdmin(user)) {
    throw new UserError(`The default admin account cannot be ${action}. It always remains.`);
  }
}

async function loadTarget(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("This user no longer exists");
  return user;
}

export async function listUsers() {
  const users = await db.user.findMany({
    orderBy: [{ type: "asc" }, { isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      type: true,
      isActive: true,
      createdAt: true,
      createdById: true,
      createdBy: { select: { name: true } },
      _count: { select: { createdUsers: true } },
    },
  });
  const [bills, lastSales, held, moneyRows] = await Promise.all([
    db.sale.groupBy({ by: ["userId"], where: { status: "COMPLETED" }, _count: { _all: true } }),
    db.sale.groupBy({
      by: ["userId"],
      where: { status: "COMPLETED" },
      _max: { completedAt: true },
    }),
    db.sale.groupBy({ by: ["userId"], where: { status: "HELD" }, _count: { _all: true } }),
    db.cashFlow.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);
  const billCount = new Map(bills.map((row) => [row.userId, row._count._all]));
  const lastSale = new Map(lastSales.map((row) => [row.userId, row._max.completedAt]));
  const hasHeld = new Set(held.map((row) => row.userId));
  const hasMoney = new Set(moneyRows.map((row) => row.userId));
  const activeAdmins = users.filter((u) => u.type === "ADMIN" && u.isActive).length;

  return users.map((user) => {
    const served = billCount.get(user.id) ?? 0;
    const lastActiveAdmin = user.type === "ADMIN" && user.isActive && activeAdmins === 1;
    const defaultAdmin = isDefaultAdmin(user);
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      type: user.type,
      isActive: user.isActive,
      createdAt: user.createdAt,
      createdByName: user.createdBy?.name ?? null,
      billCount: served,
      lastSale: lastSale.get(user.id) ?? null,
      lastActiveAdmin,
      defaultAdmin,
      canDelete:
        !defaultAdmin &&
        served === 0 &&
        !hasHeld.has(user.id) &&
        !hasMoney.has(user.id) &&
        user._count.createdUsers === 0 &&
        !lastActiveAdmin,
    };
  });
}

/** Any admin can create an admin or a staff account; the creator is recorded. */
export async function createUser(
  input: { name: string; username: string; password: string; type: string },
  createdById: string,
) {
  const { name, username } = cleanIdentity(input);
  checkRole(input.type);
  checkPassword(input.password);
  try {
    return await db.user.create({
      data: {
        name,
        username,
        type: input.type,
        createdById,
        passwordHash: await bcrypt.hash(input.password, 12),
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(`The username "${username}" is taken`);
    throw error;
  }
}

/** Name, username and role. Changing the role ends that person's sessions. */
export async function updateUser(
  actorId: string,
  userId: string,
  input: { name: string; username: string; type: string },
) {
  const { name, username } = cleanIdentity(input);
  checkRole(input.type);
  const type = input.type;
  try {
    await db.$transaction(async (tx) => {
      await lockAdmins(tx);
      const user = await loadTarget(tx, userId);
      const roleChanges = user.type !== type;
      if (roleChanges) protectDefaultAdmin(user, "changed to staff");
      onlyDefaultAdminItself(user, actorId);
      if (roleChanges && userId === actorId) {
        throw new UserError("You cannot change your own role. Ask another admin.");
      }
      if (roleChanges && user.type === "ADMIN" && user.isActive) {
        await keepOneAdmin(tx, userId, `changed to ${ROLE_LABELS.STAFF.toLowerCase()}`);
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          name,
          username,
          type,
          ...(roleChanges ? { sessionVersion: { increment: 1 } } : {}),
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError(`The username "${username}" is taken`);
    throw error;
  }
}

/** Sets a new password and logs the person out on every device. */
export async function resetPassword(actorId: string, userId: string, password: string) {
  checkPassword(password);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError("This user no longer exists");
  onlyDefaultAdminItself(user, actorId);
  const updated = await db.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return updated;
}

/** Deactivating logs the person out at once; they keep their history. */
export async function setUserActive(actorId: string, userId: string, isActive: boolean) {
  await db.$transaction(async (tx) => {
    await lockAdmins(tx);
    const user = await loadTarget(tx, userId);
    if (!isActive) {
      if (userId === actorId) throw new UserError("You cannot deactivate your own account");
      protectDefaultAdmin(user, "deactivated");
      if (user.type === "ADMIN" && user.isActive) await keepOneAdmin(tx, userId, "deactivated");
    }
    await tx.user.update({
      where: { id: userId },
      data: { isActive, ...(isActive ? {} : { sessionVersion: { increment: 1 } }) },
    });
  });
}

/**
 * Deletes an account with no history at all: no bills served or held, no money
 * recorded and no accounts created. Anyone else is deactivated instead.
 */
export async function deleteUser(actorId: string, userId: string) {
  await db.$transaction(async (tx) => {
    await lockAdmins(tx);
    const user = await loadTarget(tx, userId);
    if (userId === actorId) throw new UserError("You cannot delete your own account");
    protectDefaultAdmin(user, "deleted");
    if (user.type === "ADMIN" && user.isActive) await keepOneAdmin(tx, userId, "deleted");

    const [bills, heldBills, moneyRows, created] = await Promise.all([
      tx.sale.count({ where: { userId, status: "COMPLETED" } }),
      tx.sale.count({ where: { userId, status: "HELD" } }),
      tx.cashFlow.count({ where: { userId } }),
      tx.user.count({ where: { createdById: userId } }),
    ]);
    if (bills > 0 || moneyRows > 0) {
      throw new UserError(
        `${user.name} has served ${bills} bill${bills === 1 ? "" : "s"} or recorded money, so the account is kept for the records. Deactivate it instead.`,
      );
    }
    if (heldBills > 0) {
      throw new UserError(
        `${user.name} has ${heldBills} held bill(s). Complete or discard them first.`,
      );
    }
    if (created > 0) {
      throw new UserError(
        `${user.name} created ${created} other account(s), so it is kept for the records. Deactivate it instead.`,
      );
    }
    await tx.user.delete({ where: { id: userId } });
  });
}
