import { describe, expect, it } from "vitest";
import { sessionIsCurrent } from "@/lib/session-rules";
import { db } from "@/lib/db";
import { completeSale, holdSale } from "@/server/services/sales";
import {
  createUser,
  deleteUser,
  listUsers,
  resetPassword,
  setUserActive,
  updateUser,
} from "@/server/services/users";
import { shopFixture } from "./fixtures";

async function firstAdmin() {
  return db.user.create({
    data: { name: "Owner", type: "ADMIN", username: "owner", passwordHash: "x" },
  });
}

const version = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).sessionVersion;

describe("users", () => {
  it("admins create admins and staff, and the creator is recorded", async () => {
    const owner = await firstAdmin();
    const manager = await createUser(
      { name: "Manager", username: "manager", password: "secret1", type: "ADMIN" },
      owner.id,
    );
    const staff = await createUser(
      { name: "Bilal", username: "bilal", password: "secret1", type: "STAFF" },
      manager.id,
    );

    const rows = await listUsers();
    const row = (id: string) => rows.find((u) => u.id === id)!;
    expect(row(owner.id)).toMatchObject({ type: "ADMIN", createdByName: null });
    expect(row(manager.id)).toMatchObject({ type: "ADMIN", createdByName: "Owner" });
    expect(row(staff.id)).toMatchObject({ type: "STAFF", createdByName: "Manager" });

    await expect(
      createUser({ name: "Copy", username: "Bilal", password: "secret1", type: "STAFF" }, owner.id),
    ).rejects.toThrow(/taken/);
    await expect(
      createUser({ name: "X", username: "xx", password: "secret1", type: "STAFF" }, owner.id),
    ).rejects.toThrow(/Username/);
    await expect(
      createUser({ name: "Weak", username: "weak", password: "123", type: "STAFF" }, owner.id),
    ).rejects.toThrow(/6 characters/);
    await expect(
      createUser({ name: "Boss", username: "boss", password: "secret1", type: "OWNER" }, owner.id),
    ).rejects.toThrow(/role/);
  });

  it("nobody can remove or demote themselves", async () => {
    const owner = await firstAdmin();
    const manager = await createUser(
      { name: "Manager", username: "manager", password: "secret1", type: "ADMIN" },
      owner.id,
    );
    await expect(setUserActive(manager.id, manager.id, false)).rejects.toThrow(/your own account/);
    await expect(deleteUser(manager.id, manager.id)).rejects.toThrow(/your own account/);
    await expect(
      updateUser(manager.id, manager.id, { name: "Manager", username: "manager", type: "STAFF" }),
    ).rejects.toThrow(/your own role/);
  });

  it("the default admin always remains: no other admin can delete, deactivate or demote it", async () => {
    const owner = await firstAdmin();
    const manager = await createUser(
      { name: "Manager", username: "manager", password: "secret1", type: "ADMIN" },
      owner.id,
    );

    const rows = await listUsers();
    expect(rows.find((u) => u.id === owner.id)).toMatchObject({
      defaultAdmin: true,
      canDelete: false,
    });
    expect(rows.find((u) => u.id === manager.id)).toMatchObject({ defaultAdmin: false });

    await expect(deleteUser(manager.id, owner.id)).rejects.toThrow(
      /default admin account cannot be deleted/,
    );
    await expect(setUserActive(manager.id, owner.id, false)).rejects.toThrow(
      /cannot be deactivated/,
    );
    await expect(
      updateUser(manager.id, owner.id, { name: "Owner", username: "owner", type: "STAFF" }),
    ).rejects.toThrow(/cannot be changed to staff/);

    // Only the default admin itself can rename it or change its password.
    await expect(
      updateUser(manager.id, owner.id, { name: "Taken Over", username: "owner", type: "ADMIN" }),
    ).rejects.toThrow(/Only the default admin/);
    await expect(resetPassword(manager.id, owner.id, "hijack1")).rejects.toThrow(
      /Only the default admin/,
    );
    await updateUser(owner.id, owner.id, { name: "Khalid", username: "khalid", type: "ADMIN" });
    await resetPassword(owner.id, owner.id, "newpass1");
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      name: "Khalid",
      isActive: true,
      type: "ADMIN",
    });

    // Other admins are not protected: the default admin can demote or remove them.
    await updateUser(owner.id, manager.id, { name: "Manager", username: "manager", type: "STAFF" });
    await deleteUser(owner.id, manager.id);
  });

  it("edits names and usernames, keeping usernames unique", async () => {
    const owner = await firstAdmin();
    await createUser(
      { name: "Bilal", username: "bilal", password: "secret1", type: "STAFF" },
      owner.id,
    );
    await updateUser(owner.id, owner.id, {
      name: "  Khalid   Mehmood ",
      username: "KHALID",
      type: "ADMIN",
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: owner.id } })).toMatchObject({
      name: "Khalid Mehmood",
      username: "khalid",
    });
    await expect(
      updateUser(owner.id, owner.id, { name: "Khalid", username: "bilal", type: "ADMIN" }),
    ).rejects.toThrow(/taken/);
  });

  it("ends sessions on password reset, role change and deactivation, not on a rename", async () => {
    const owner = await firstAdmin();
    const staff = await createUser(
      { name: "Bilal", username: "bilal", password: "secret1", type: "STAFF" },
      owner.id,
    );
    const login = { ver: await version(staff.id) };
    const current = async () =>
      sessionIsCurrent(await db.user.findUnique({ where: { id: staff.id } }), login);
    expect(await current()).toBe(true);

    await updateUser(owner.id, staff.id, { name: "Bilal Ahmed", username: "bilal", type: "STAFF" });
    expect(await current()).toBe(true);

    await resetPassword(owner.id, staff.id, "newpass1");
    expect(await current()).toBe(false);
    login.ver = await version(staff.id);

    await updateUser(owner.id, staff.id, { name: "Bilal Ahmed", username: "bilal", type: "ADMIN" });
    expect(await current()).toBe(false);
    login.ver = await version(staff.id);

    await setUserActive(owner.id, staff.id, false);
    expect(await current()).toBe(false);
    await setUserActive(owner.id, staff.id, true);
    // Reactivating does not bring back the old session: they log in again.
    expect(await current()).toBe(false);
  });

  it("deletes only accounts with no history", async () => {
    const owner = await firstAdmin();
    const { black, customer } = await shopFixture();
    const idle = await createUser(
      { name: "Idle", username: "idle", password: "secret1", type: "STAFF" },
      owner.id,
    );
    const busy = await createUser(
      { name: "Busy", username: "busy", password: "secret1", type: "STAFF" },
      owner.id,
    );
    const holder = await createUser(
      { name: "Holder", username: "holder", password: "secret1", type: "STAFF" },
      owner.id,
    );
    const creator = await createUser(
      { name: "Creator", username: "creator", password: "secret1", type: "ADMIN" },
      owner.id,
    );
    await createUser(
      { name: "Made", username: "made", password: "secret1", type: "STAFF" },
      creator.id,
    );

    await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: black.id, qty: "1", discount: 0 }],
        billDiscount: 0,
        payments: [{ method: "CASH", amount: 650 }],
      },
      busy.id,
    );
    await holdSale(
      { lines: [{ variantId: black.id, qty: "1", discount: 0 }], billDiscount: 0 },
      holder.id,
    );

    const rows = await listUsers();
    const row = (id: string) => rows.find((u) => u.id === id)!;
    expect([idle, busy, holder, creator].map((u) => row(u.id).canDelete)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(row(busy.id).billCount).toBe(1);

    await expect(deleteUser(owner.id, busy.id)).rejects.toThrow(/Deactivate it instead/);
    await expect(deleteUser(owner.id, holder.id)).rejects.toThrow(/held bill/);
    await expect(deleteUser(owner.id, creator.id)).rejects.toThrow(/created 1 other account/);
    await deleteUser(owner.id, idle.id);
    expect(await db.user.findUnique({ where: { id: idle.id } })).toBeNull();
  });
});
