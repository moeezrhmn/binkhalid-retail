"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/cart";
import { toResult, type Result } from "@/server/services/errors";
import { createReturn } from "@/server/services/returns";

const uuid = z.uuid();
const returnSchema = z.object({
  originalSaleId: uuid.nullable(),
  items: z
    .array(
      z.union([
        z.object({ saleItemId: uuid, qty: z.string().max(20), restock: z.boolean() }),
        z.object({
          variantId: uuid,
          qty: z.string().max(20),
          restock: z.boolean(),
          amount: z.number().int().min(0),
        }),
      ]),
    )
    .min(1, "Pick at least one item")
    .max(100),
  refunds: z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: z.number().int() })).max(6),
});

export async function createReturnAction(
  input: z.input<typeof returnSchema>,
): Promise<Result<{ id: string; returnNo: number; refundAmount: number }>> {
  const user = await requireAdmin();
  const parsed = returnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const result = await toResult(() =>
    createReturn({ type: "RETURN", ...parsed.data, userId: user.id }),
  );
  revalidatePath("/", "layout");
  return result;
}
