"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/cart";
import { todayRange } from "@/lib/dates";
import { db } from "@/lib/db";
import {
  quickAddCustomer,
  searchCustomers,
  similarCustomers,
  type CustomerOption,
} from "@/server/services/customers";
import { toResult, type Result } from "@/server/services/errors";
import {
  completeSale,
  discardHeldSale,
  getHeldSale,
  holdSale,
  listHeldSales,
  lookupForPos,
  type PosVariant,
} from "@/server/services/sales";

// Every action here is open to staff as well as the admin (POS / Billing).

export async function lookupAction(term: string) {
  await requireUser();
  return lookupForPos(String(term).slice(0, 100));
}

export async function searchCustomersAction(q: string): Promise<CustomerOption[]> {
  await requireUser();
  return searchCustomers(String(q).slice(0, 60));
}

export async function similarCustomersAction(name: string): Promise<CustomerOption[]> {
  await requireUser();
  return similarCustomers(String(name).slice(0, 80));
}

export async function quickAddCustomerAction(input: {
  name: string;
  phone: string;
}): Promise<Result<CustomerOption>> {
  await requireUser();
  return toResult(() => quickAddCustomer({ name: String(input.name), phone: String(input.phone) }));
}

const uuid = z.uuid();
const cartSchema = z.object({
  heldSaleId: uuid.nullable().optional(),
  customerId: uuid.nullable().optional(),
  lines: z
    .array(
      z.object({ variantId: uuid, qty: z.string().max(20), discount: z.number().int().min(0) }),
    )
    .max(300),
  billDiscount: z.number().int().min(0),
  note: z.string().max(200).nullable().optional(),
});

const completeSchema = cartSchema.extend({
  payments: z
    .array(z.object({ method: z.enum(PAYMENT_METHODS), amount: z.number().int() }))
    .max(10),
  cashReceived: z.number().int().min(0).nullable().optional(),
  exchange: z
    .object({
      originalSaleId: uuid,
      items: z
        .array(z.object({ saleItemId: uuid, qty: z.string().max(20), restock: z.boolean() }))
        .min(1)
        .max(100),
    })
    .nullable()
    .optional(),
});

export type CompleteSaleInput = z.input<typeof completeSchema>;

export async function completeSaleAction(
  input: CompleteSaleInput,
): Promise<
  Result<{ id: string; billNo: number; total: number; change: number; exchangeRefund: number }>
> {
  const user = await requireUser();
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The bill could not be read. Please try again." };
  const result = await toResult(() => completeSale(parsed.data, user.id));
  revalidatePath("/", "layout");
  return result;
}

export async function holdSaleAction(
  input: z.input<typeof cartSchema>,
): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  const parsed = cartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The bill could not be read. Please try again." };
  return toResult(() => holdSale(parsed.data, user.id));
}

export async function listHeldAction() {
  await requireUser();
  return listHeldSales();
}

export async function getHeldAction(id: string): Promise<
  Result<{
    id: string;
    customer: CustomerOption | null;
    billDiscount: number;
    note: string | null;
    lines: { variant: PosVariant; qty: string; discount: number }[];
  }>
> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Unknown bill" };
  const held = await getHeldSale(id);
  return held
    ? { ok: true, data: held }
    : { ok: false, error: "This bill was already completed or discarded" };
}

export async function discardHeldAction(id: string): Promise<Result<null>> {
  await requireUser();
  if (!uuid.safeParse(id).success) return { ok: false, error: "Unknown bill" };
  return toResult(async () => {
    await discardHeldSale(id);
    return null;
  });
}

/** Today's completed bills, for reprinting a receipt from the counter. */
export async function recentBillsAction() {
  await requireUser();
  const { from, to } = todayRange();
  const sales = await db.sale.findMany({
    where: { status: "COMPLETED", completedAt: { gte: from, lt: to } },
    orderBy: { completedAt: "desc" },
    take: 50,
    include: { customer: { select: { name: true } } },
  });
  return sales.map((sale) => ({
    id: sale.id,
    billNo: sale.billNo!,
    completedAt: sale.completedAt!,
    customerName: sale.customer?.name ?? "",
    total: sale.total,
  }));
}
