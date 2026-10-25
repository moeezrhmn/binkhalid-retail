"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { toResult, type Result } from "@/server/services/errors";
import { saveShopSettings } from "@/server/services/shop-settings";
import { createStaff, resetPassword, setStaffActive } from "@/server/services/users";

const settingsSchema = z.object({
  shopName: z.string(),
  shopAddress: z.string(),
  shopPhone: z.string(),
  receiptHeader: z.string(),
  receiptFooter: z.string(),
  labelWidthMm: z.coerce.number(),
  labelHeightMm: z.coerce.number(),
  receiptWidthMm: z.coerce.number(),
});

export async function saveSettingsAction(
  input: z.input<typeof settingsSchema>,
): Promise<Result<null>> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the settings" };
  const result = await toResult(async () => {
    await saveShopSettings(parsed.data);
    return null;
  });
  revalidatePath("/", "layout");
  return result;
}

export async function createStaffAction(input: {
  name: string;
  username: string;
  password: string;
}): Promise<Result<null>> {
  await requireAdmin();
  const result = await toResult(async () => {
    await createStaff(input);
    return null;
  });
  revalidatePath("/settings/staff");
  return result;
}

export async function resetPasswordAction(userId: string, password: string): Promise<Result<null>> {
  await requireAdmin();
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Unknown user" };
  return toResult(async () => {
    await resetPassword(userId, String(password));
    return null;
  });
}

export async function setStaffActiveAction(
  userId: string,
  isActive: boolean,
): Promise<Result<null>> {
  await requireAdmin();
  if (!z.uuid().safeParse(userId).success) return { ok: false, error: "Unknown user" };
  const result = await toResult(async () => {
    await setStaffActive(userId, Boolean(isActive));
    return null;
  });
  revalidatePath("/settings/staff");
  return result;
}
