"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  createCustomer,
  receivePayment,
  RECEIVE_METHODS,
  updateCustomer,
} from "@/server/services/customers";
import { toResult, type Result } from "@/server/services/errors";

const money = (value: unknown) => Number(String(value ?? "").replace(/[,\s]/g, "") || 0);

const customerSchema = z.object({
  name: z.string().max(80),
  phone: z.string().max(30),
  notes: z.string().max(300),
  openingBalance: z.string().max(12).optional(),
});

export async function saveCustomerAction(
  id: string | null,
  input: z.input<typeof customerSchema>,
): Promise<Result<{ id: string }>> {
  const user = await requireAdmin();
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the customer details" };
  if (id && !z.uuid().safeParse(id).success) return { ok: false, error: "Unknown customer" };
  const result = await toResult(async () => {
    const customer = id
      ? await updateCustomer(id, parsed.data)
      : await createCustomer(
          { ...parsed.data, openingBalance: money(parsed.data.openingBalance) },
          user.id,
        );
    return { id: customer.id };
  });
  revalidatePath("/customers", "layout");
  return result;
}

export async function receivePaymentAction(input: {
  customerId: string;
  amount: string;
  method: string;
  note: string;
}): Promise<Result<null>> {
  const user = await requireAdmin();
  if (!z.uuid().safeParse(input.customerId).success)
    return { ok: false, error: "Unknown customer" };
  const method = z.enum(RECEIVE_METHODS).safeParse(input.method);
  if (!method.success) return { ok: false, error: "Pick how the money was paid" };
  const result = await toResult(async () => {
    await receivePayment(
      {
        customerId: input.customerId,
        amount: money(input.amount),
        method: method.data,
        note: input.note,
      },
      user.id,
    );
    return null;
  });
  revalidatePath("/", "layout");
  return result;
}
