import "server-only";
import { db } from "@/lib/db";
import type { ShopSettings } from "@/lib/settings";
import { UserError } from "./errors";

const LIMITS = {
  labelWidthMm: [20, 120],
  labelHeightMm: [15, 100],
  receiptWidthMm: [48, 80],
} as const;

export async function saveShopSettings(input: ShopSettings) {
  const shopName = input.shopName.trim();
  if (!shopName || shopName.length > 60) throw new UserError("Enter the shop name");
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const value = input[key as keyof typeof LIMITS];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new UserError(
        `${key
          .replace(/Mm$/, "")
          .replace(/([A-Z])/g, " $1")
          .toLowerCase()} must be ${min}-${max} mm`,
      );
    }
  }
  const values: Record<keyof ShopSettings, string> = {
    shopName,
    shopAddress: input.shopAddress.trim().slice(0, 200),
    shopPhone: input.shopPhone.trim().slice(0, 40),
    receiptHeader: input.receiptHeader.trim().slice(0, 200),
    receiptFooter: input.receiptFooter.trim().slice(0, 200),
    labelWidthMm: String(input.labelWidthMm),
    labelHeightMm: String(input.labelHeightMm),
    receiptWidthMm: String(input.receiptWidthMm),
  };
  await db.$transaction(
    Object.entries(values).map(([key, value]) =>
      db.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );
}
