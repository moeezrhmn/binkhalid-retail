import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { SalePaymentMethod } from "@/lib/cart";
import { db } from "@/lib/db";
import { qtyToMilli, roundDiv } from "@/lib/money";
import { validateQty } from "@/lib/units";
import { UserError } from "./errors";
import { applyMovement } from "./stock";

type Tx = Prisma.TransactionClient;

export type ReturnItemInput =
  /** An item from the original bill: the refund is what the customer actually paid for it. */
  | { saleItemId: string; qty: string; restock: boolean }
  /** No bill: the admin picks the variant and the amount to give back. */
  | { variantId: string; qty: string; restock: boolean; amount: number };

export type RefundInput = { method: SalePaymentMethod; amount: number };

async function nextNumber(tx: Tx, key: string) {
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}

/**
 * Creates a return inside the caller's transaction: checks quantities against
 * what was sold and already returned, restocks what goes back on the shelf,
 * and writes the refund to CashFlow. An exchange refunds as EXCHANGE credit,
 * which the new sale then uses.
 */
export async function createReturnTx(
  tx: Tx,
  input: {
    originalSaleId: string | null;
    items: ReturnItemInput[];
    userId: string;
    customerId?: string | null;
  } & ({ type: "RETURN"; refunds: RefundInput[] } | { type: "EXCHANGE" }),
) {
  if (input.items.length === 0) throw new UserError("Pick at least one item to return");

  let customerId = input.customerId ?? null;
  const lines: {
    saleItemId: string | null;
    variantId: string;
    qty: Prisma.Decimal;
    amount: number;
    restock: boolean;
  }[] = [];

  if (input.originalSaleId) {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${input.originalSaleId}::uuid FOR UPDATE`;
    const sale = await tx.sale.findUnique({
      where: { id: input.originalSaleId },
      include: {
        items: {
          include: {
            returnItems: true,
            variant: { select: { product: { select: { unit: true } } } },
          },
        },
      },
    });
    if (!sale || sale.status !== "COMPLETED")
      throw new UserError("Only completed bills can be returned");
    customerId = sale.customerId;

    for (const item of input.items) {
      if (!("saleItemId" in item)) throw new UserError("Pick items from the bill");
      const saleItem = sale.items.find((line) => line.id === item.saleItemId);
      if (!saleItem) throw new UserError("An item does not belong to this bill");
      const error = validateQty(saleItem.variant.product.unit, item.qty);
      if (error) throw new UserError(`${saleItem.nameSnapshot}: ${error}`);

      const soldMilli = qtyToMilli(saleItem.qty.toString());
      const returnedMilli = saleItem.returnItems.reduce(
        (sum, r) => sum + qtyToMilli(r.qty.toString()),
        0,
      );
      const qtyMilli = qtyToMilli(item.qty);
      if (qtyMilli > soldMilli - returnedMilli) {
        const left = (soldMilli - returnedMilli) / 1000;
        throw new UserError(`${saleItem.nameSnapshot}: only ${left} left to return on this bill`);
      }
      lines.push({
        saleItemId: saleItem.id,
        variantId: saleItem.variantId,
        qty: new Prisma.Decimal(item.qty),
        amount: roundDiv(saleItem.netTotal * qtyMilli, soldMilli),
        restock: item.restock,
      });
    }
  } else {
    for (const item of input.items) {
      if (!("variantId" in item)) throw new UserError("Pick the returned variant");
      const variant = await tx.variant.findUnique({
        where: { id: item.variantId },
        select: { id: true, code: true, product: { select: { unit: true } } },
      });
      if (!variant) throw new UserError("A variant no longer exists");
      const error = validateQty(variant.product.unit, item.qty);
      if (error) throw new UserError(`${variant.code}: ${error}`);
      if (!Number.isInteger(item.amount) || item.amount < 0) {
        throw new UserError(`${variant.code}: enter the amount to give back in whole rupees`);
      }
      lines.push({
        saleItemId: null,
        variantId: variant.id,
        qty: new Prisma.Decimal(item.qty),
        amount: item.amount,
        restock: item.restock,
      });
    }
  }

  const refundAmount = lines.reduce((sum, line) => sum + line.amount, 0);

  const refunds: { method: SalePaymentMethod | "EXCHANGE"; amount: number }[] =
    input.type === "EXCHANGE" ? [{ method: "EXCHANGE", amount: refundAmount }] : input.refunds;
  if (input.type === "RETURN") {
    for (const refund of refunds) {
      if (!Number.isInteger(refund.amount) || refund.amount <= 0) {
        throw new UserError("Refund amounts must be whole rupees above 0");
      }
      if (refund.method === "CREDIT" && !customerId) {
        throw new UserError("A refund to udhaar needs a customer");
      }
    }
    const refunded = refunds.reduce((sum, refund) => sum + refund.amount, 0);
    if (refunded !== refundAmount) {
      throw new UserError(`The refund must add up to Rs ${refundAmount}`);
    }
  }

  const saleReturn = await tx.saleReturn.create({
    data: {
      returnNo: await nextNumber(tx, "return"),
      originalSaleId: input.originalSaleId,
      type: input.type,
      refundAmount,
      items: {
        create: lines.map((line) => ({
          saleItemId: line.saleItemId,
          variantId: line.variantId,
          qty: line.qty,
          amount: line.amount,
          restock: line.restock,
        })),
      },
    },
  });

  for (const line of lines.filter((l) => l.restock)) {
    await applyMovement(tx, {
      variantId: line.variantId,
      type: "RETURN",
      qty: line.qty,
      saleReturnId: saleReturn.id,
      reason: `Return #${saleReturn.returnNo}`,
    });
  }

  const nonZero = refunds.filter((refund) => refund.amount > 0);
  if (nonZero.length > 0) {
    await tx.cashFlow.createMany({
      data: nonZero.map((refund) => ({
        type: "REFUND" as const,
        method: refund.method,
        amount: -refund.amount,
        saleReturnId: saleReturn.id,
        customerId: refund.method === "CREDIT" ? customerId : null,
        userId: input.userId,
      })),
    });
  }

  return { id: saleReturn.id, returnNo: saleReturn.returnNo, refundAmount, customerId };
}

export async function createReturn(
  input: Parameters<typeof createReturnTx>[1] & { type: "RETURN" },
) {
  return db.$transaction((tx) => createReturnTx(tx, input));
}

/**
 * What an exchange's returned items are worth, before anything is saved. The
 * same rules run again when the exchange is completed.
 */
export async function previewExchange(
  originalSaleId: string,
  items: { saleItemId: string; qty: string; restock: boolean }[],
) {
  const sale = await db.sale.findUnique({
    where: { id: originalSaleId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: { include: { returnItems: { select: { qty: true } } } },
    },
  });
  if (!sale || sale.status !== "COMPLETED" || !sale.customer) return null;

  const lines = items.flatMap((item) => {
    const saleItem = sale.items.find((line) => line.id === item.saleItemId);
    if (!saleItem) return [];
    let qtyMilli: number;
    try {
      qtyMilli = qtyToMilli(item.qty);
    } catch {
      return [];
    }
    const soldMilli = qtyToMilli(saleItem.qty.toString());
    const returnedMilli = saleItem.returnItems.reduce(
      (sum, r) => sum + qtyToMilli(r.qty.toString()),
      0,
    );
    if (qtyMilli <= 0 || qtyMilli > soldMilli - returnedMilli) return [];
    return [
      {
        saleItemId: saleItem.id,
        name: saleItem.nameSnapshot,
        qty: item.qty,
        restock: item.restock,
        amount: roundDiv(saleItem.netTotal * qtyMilli, soldMilli),
      },
    ];
  });
  if (lines.length === 0) return null;

  return {
    originalSaleId: sale.id,
    billNo: sale.billNo!,
    customer: sale.customer,
    items: lines,
    credit: lines.reduce((sum, line) => sum + line.amount, 0),
  };
}
