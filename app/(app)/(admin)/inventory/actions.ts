"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { toResult, type Result } from "@/server/services/errors";
import {
  ADJUST_REASONS,
  adjustStock,
  saveSupplier,
  stockIn,
  type StockInItem,
} from "@/server/services/stock";

const qty = z.string().trim().min(1, "Enter a quantity").max(20);

const stockInSchema = z.object({
  supplierId: z.uuid().nullable(),
  note: z.string().max(200).nullable(),
  items: z
    .array(
      z.object({
        variantId: z.uuid(),
        qty,
        unitCost: z.number().int().min(0).nullable(),
        updateCost: z.boolean(),
      }),
    )
    .min(1, "Add at least one item")
    .max(300),
});

export async function stockInAction(
  input: z.input<typeof stockInSchema>,
): Promise<Result<{ variantId: string; code: string; qty: string }[]>> {
  await requireAdmin();
  const parsed = stockInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await toResult(() =>
    stockIn({ ...parsed.data, items: parsed.data.items as StockInItem[] }),
  );
  revalidatePath("/", "layout");
  return result;
}

const adjustSchema = z.object({
  variantId: z.uuid(),
  reason: z.enum(ADJUST_REASONS),
  qty,
  note: z.string().max(200).nullable(),
});

export async function adjustStockAction(
  input: z.input<typeof adjustSchema>,
): Promise<Result<{ code: string; change: string }>> {
  await requireAdmin();
  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await toResult(() => adjustStock(parsed.data));
  revalidatePath("/", "layout");
  return result;
}

const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().max(80),
  phone: z.string().max(30).nullable(),
  notes: z.string().max(300).nullable(),
});

export async function saveSupplierAction(
  input: z.input<typeof supplierSchema>,
): Promise<Result<{ id: string; name: string }>> {
  await requireAdmin();
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await toResult(async () => {
    const supplier = await saveSupplier(parsed.data);
    return { id: supplier.id, name: supplier.name };
  });
  revalidatePath("/inventory", "layout");
  return result;
}
