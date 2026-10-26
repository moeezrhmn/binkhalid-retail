"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { toResult, type Result } from "@/server/services/errors";
import { saveShopSettings } from "@/server/services/shop-settings";

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
