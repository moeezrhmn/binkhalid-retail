import "server-only";
import { Prisma, type StockMovementType } from "@/generated/prisma/client";
import { normalizeCode } from "@/lib/codes";
import type { DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { validateQty, type UnitCode } from "@/lib/units";
import { variantLabel } from "@/lib/variants";
import { UserError } from "./errors";

type Tx = Prisma.TransactionClient;

export type MovementInput = {
  variantId: string;
  type: StockMovementType;
  /** Signed: + into stock, − out of stock. */
  qty: Prisma.Decimal | string;
  unitCost?: number | null;
  reason?: string | null;
  supplierId?: string | null;
  saleId?: string | null;
  saleReturnId?: string | null;
};

/**
 * The only way stock changes: writes the movement and moves the cached
 * stockQty by the same amount, atomically (stockQty = stockQty + qty).
 * Must run inside the caller's transaction.
 */
export async function applyMovement(tx: Tx, input: MovementInput) {
  const qty = new Prisma.Decimal(input.qty.toString());
  if (qty.isZero()) return null;
  const movement = await tx.stockMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      qty,
      unitCost: input.unitCost ?? null,
      reason: input.reason ?? null,
      supplierId: input.supplierId ?? null,
      saleId: input.saleId ?? null,
      saleReturnId: input.saleReturnId ?? null,
    },
  });
  await tx.variant.update({
    where: { id: input.variantId },
    data: { stockQty: { increment: qty } },
  });
  return movement;
}

/** Locks a variant row for the rest of the transaction and returns its unit. */
async function lockVariant(tx: Tx, variantId: string) {
  await tx.$queryRaw`SELECT id FROM "Variant" WHERE id = ${variantId}::uuid FOR UPDATE`;
  const variant = await tx.variant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      code: true,
      stockQty: true,
      costPrice: true,
      product: { select: { unit: true } },
    },
  });
  if (!variant) throw new UserError("A variant no longer exists");
  return variant;
}

export type StockInItem = {
  variantId: string;
  qty: string;
  /** Cost paid per unit for this delivery; defaults to the current cost price. */
  unitCost?: number | null;
  /** Also make this the variant's cost price for future sales. */
  updateCost?: boolean;
};

export async function stockIn(input: {
  supplierId?: string | null;
  note?: string | null;
  items: StockInItem[];
}) {
  if (input.items.length === 0) throw new UserError("Add at least one item");
  const seen = new Set<string>();

  return db.$transaction(async (tx) => {
    if (input.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new UserError("The supplier no longer exists");
    }
    const received: { variantId: string; code: string; qty: string }[] = [];
    for (const item of input.items) {
      if (seen.has(item.variantId)) throw new UserError("Each variant can be listed only once");
      seen.add(item.variantId);

      const variant = await lockVariant(tx, item.variantId);
      const error = validateQty(variant.product.unit, item.qty);
      if (error) throw new UserError(`${variant.code}: ${error}`);
      const unitCost = item.unitCost ?? variant.costPrice;
      if (!Number.isInteger(unitCost) || unitCost < 0) {
        throw new UserError(`${variant.code}: cost must be whole rupees`);
      }

      await applyMovement(tx, {
        variantId: variant.id,
        type: "STOCK_IN",
        qty: item.qty,
        unitCost,
        supplierId: input.supplierId ?? null,
        reason: input.note?.trim() || null,
      });
      if (item.updateCost && unitCost !== variant.costPrice) {
        await tx.variant.update({ where: { id: variant.id }, data: { costPrice: unitCost } });
      }
      received.push({ variantId: variant.id, code: variant.code, qty: item.qty });
    }
    return received;
  });
}

export const ADJUST_REASONS = ["Damage", "Loss", "Count correction", "Other"] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number];

/**
 * Damage and Loss remove stock; Count correction sets stock to the counted
 * quantity; Other adds or removes. The reason is always recorded.
 */
export async function adjustStock(input: {
  variantId: string;
  reason: AdjustReason;
  /** Damage/Loss: quantity removed. Other: signed change. Count correction: counted quantity. */
  qty: string;
  note?: string | null;
}) {
  const note = input.note?.trim() || "";
  if (input.reason === "Other" && !note) throw new UserError("Explain the reason for this change");

  return db.$transaction(async (tx) => {
    const variant = await lockVariant(tx, input.variantId);
    const unit = variant.product.unit as UnitCode;
    let change: Prisma.Decimal;
    let reason: string = input.reason;

    if (input.reason === "Count correction") {
      const error = validateQty(unit, input.qty, { allowZero: true });
      if (error) throw new UserError(`Counted quantity: ${error}`);
      change = new Prisma.Decimal(input.qty).minus(variant.stockQty);
      reason = `Count correction (was ${variant.stockQty.toString()}, counted ${input.qty})`;
    } else {
      const negative = input.qty.trim().startsWith("-");
      const magnitude = negative ? input.qty.trim().slice(1) : input.qty;
      const error = validateQty(unit, magnitude);
      if (error) throw new UserError(error);
      const sign = input.reason === "Other" && !negative ? 1 : -1;
      change = new Prisma.Decimal(magnitude).times(sign);
    }
    if (note) reason = `${reason}: ${note}`;

    if (change.isZero()) throw new UserError("The counted quantity is the same as the stock");
    await applyMovement(tx, { variantId: variant.id, type: "ADJUSTMENT", qty: change, reason });
    return { code: variant.code, change: change.toString() };
  });
}

export type StockFilter = {
  q?: string;
  categoryId?: string;
  lowOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listStock(filter: StockFilter) {
  const pageSize = filter.pageSize ?? 30;
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim();

  const where: Prisma.VariantWhereInput = {
    isActive: true,
    product: {
      isActive: true,
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    },
    ...(filter.lowOnly ? { stockQty: { lte: db.variant.fields.minStock } } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: normalizeCode(q) } },
            { product: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, variants] = await Promise.all([
    db.variant.count({ where }),
    db.variant.findMany({
      where,
      orderBy: [{ product: { name: "asc" } }, { code: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            unit: true,
            category: { select: { attributes: { select: { name: true, sortOrder: true } } } },
          },
        },
      },
    }),
  ]);

  const last = await db.stockMovement.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variants.map((v) => v.id) } },
    _max: { createdAt: true },
  });
  const lastChange = new Map(last.map((row) => [row.variantId, row._max.createdAt]));

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: variants.map((variant) => ({
      id: variant.id,
      code: variant.code,
      productId: variant.product.id,
      productName: variant.product.name,
      label: variantLabel(
        variant.attributes as Record<string, string>,
        variant.product.category.attributes,
      ),
      unit: variant.product.unit,
      stockQty: variant.stockQty.toString(),
      minStock: variant.minStock.toString(),
      costPrice: variant.costPrice,
      status: variant.stockQty.lessThanOrEqualTo(0)
        ? ("out" as const)
        : variant.stockQty.lessThanOrEqualTo(variant.minStock)
          ? ("low" as const)
          : ("ok" as const),
      lastChange: lastChange.get(variant.id) ?? null,
    })),
  };
}

export type MovementFilter = {
  variantId?: string;
  type?: StockMovementType;
  range?: DateRange;
  page?: number;
  pageSize?: number;
};

export async function listMovements(filter: MovementFilter) {
  const pageSize = filter.pageSize ?? 40;
  const page = Math.max(1, filter.page ?? 1);
  const where: Prisma.StockMovementWhereInput = {
    ...(filter.variantId ? { variantId: filter.variantId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.range ? { createdAt: { gte: filter.range.from, lt: filter.range.to } } : {}),
  };
  const [total, movements] = await Promise.all([
    db.stockMovement.count({ where }),
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        variant: { select: { code: true, product: { select: { name: true, unit: true } } } },
        supplier: { select: { name: true } },
        sale: { select: { id: true, billNo: true } },
        saleReturn: { select: { id: true, returnNo: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      type: m.type,
      qty: m.qty.toString(),
      unitCost: m.unitCost,
      reason: m.reason,
      code: m.variant.code,
      productName: m.variant.product.name,
      unit: m.variant.product.unit,
      supplierName: m.supplier?.name ?? null,
      sale: m.sale,
      saleReturn: m.saleReturn,
    })),
  };
}

/** True when every variant's cached stock equals the sum of its movements (used by tests). */
export async function stockMatchesMovements(variantIds?: string[]) {
  const variants = await db.variant.findMany({
    where: variantIds ? { id: { in: variantIds } } : undefined,
    select: { id: true, stockQty: true },
  });
  const sums = await db.stockMovement.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variants.map((v) => v.id) } },
    _sum: { qty: true },
  });
  const sumById = new Map(
    sums.map((row) => [row.variantId, row._sum.qty ?? new Prisma.Decimal(0)]),
  );
  return variants.every((variant) =>
    variant.stockQty.equals(sumById.get(variant.id) ?? new Prisma.Decimal(0)),
  );
}

export async function listSuppliers() {
  return db.supplier.findMany({ orderBy: { name: "asc" } });
}

export async function saveSupplier(input: {
  id?: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
}) {
  const name = input.name.trim();
  if (!name || name.length > 80) throw new UserError("Enter a supplier name (up to 80 characters)");
  const data = { name, phone: input.phone?.trim() || null, notes: input.notes?.trim() || null };
  if (input.id) {
    const exists = await db.supplier.findUnique({ where: { id: input.id } });
    if (!exists) throw new UserError("The supplier no longer exists");
    return db.supplier.update({ where: { id: input.id }, data });
  }
  return db.supplier.create({ data });
}
