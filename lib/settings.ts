import "server-only";
import { db } from "./db";

export type ShopSettings = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  receiptHeader: string;
  receiptFooter: string;
  labelWidthMm: number;
  labelHeightMm: number;
  receiptWidthMm: number;
};

const DEFAULTS: ShopSettings = {
  shopName: "Bin Khalid",
  shopAddress: "",
  shopPhone: "",
  receiptHeader: "",
  receiptFooter: "",
  labelWidthMm: 50,
  labelHeightMm: 30,
  receiptWidthMm: 80,
};

const NUMBER_KEYS = new Set(["labelWidthMm", "labelHeightMm", "receiptWidthMm"]);

export async function getSettings(): Promise<ShopSettings> {
  const rows = await db.setting.findMany();
  const settings: Record<string, string | number> = { ...DEFAULTS };
  for (const { key, value } of rows) {
    if (!(key in DEFAULTS)) continue;
    if (NUMBER_KEYS.has(key)) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) settings[key] = number;
    } else {
      settings[key] = value;
    }
  }
  return settings as ShopSettings;
}
