import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { cartTotals, PAYMENT_METHODS, priceLine, type SalePaymentMethod } from "@/lib/cart";
import { db } from "@/lib/db";
import { splitBillDiscount } from "@/lib/money";
import { validateQty } from "@/lib/units";
import { variantLabel } from "@/lib/variants";
import { requireOpenDay } from "./cash";
import { UserError } from "./errors";
import { createReturnTx, type ReturnItemInput } from "./returns";
import { applyMovement } from "./stock";

type Tx = Prisma.TransactionClient;

export type CartLineInput = { variantId: string; qty: string; discount: number };
export type PaymentInput = { method: SalePaymentMethod; amount: number };

export type CartInput = {
  heldSaleId?: string | null;
  customerId?: string | null;
  lines: CartLineInput[];
  billDiscount: number;
  note?: string | null;
};

export type CompleteInput = CartInput & {
  payments: PaymentInput[];
  cashReceived?: number | null;
  /** Items handed back in an exchange; their value pays for this sale. */
  exchange?: {
    originalSaleId: string;
    items: Extract<ReturnItemInput, { saleItemId: string }>[];
  } | null;
};

/** Prices every line from the database (never from the client) and checks it can be sold. */
async function priceCart(tx: Tx, input: CartInput, { requireStockable = true } = {}) {
  if (input.lines.length === 0) throw new UserError("The bill is empty");
  if (input.lines.length > 300) throw new UserError("Too many lines on one bill");

  const variants = await tx.variant.findMany({
    where: { id: { in: input.lines.map((line) => line.variantId) } },
    include: {
      product: {
        select: {
          name: true,
          unit: true,
          isActive: true,
          category: { select: { attributes: { select: { name: true, sortOrder: true } } } },
        },
      },
    },
  });
  const byId = new Map(variants.map((variant) => [variant.id, variant]));

  const lines = input.lines.map((line) => {
    const variant = byId.get(line.variantId);
    if (!variant) throw new UserError("An item on the bill no longer exists");
    const label = variantLabel(
      variant.attributes as Record<string, string>,
      variant.product.category.attributes,
    );
    const name = label ? `${variant.product.name} - ${label}` : variant.product.name;
    if (requireStockable && (!variant.isActive || !variant.product.isActive)) {
      throw new UserError(`${name} is inactive and cannot be sold`);
    }
    const error = validateQty(variant.product.unit, line.qty);
    if (error) throw new UserError(`${name}: ${error}`);
    if (!Number.isInteger(line.discount) || line.discount < 0) {
      throw new UserError(`${name}: discount must be whole rupees`);
    }
    const priced = priceLine(variant.salePrice, line.qty, line.discount);
    if (line.discount > priced.gross)
      throw new UserError(`${name}: discount is more than the line`);
    return {
      variantId: variant.id,
      nameSnapshot: name,
      codeSnapshot: variant.code,
      costSnapshot: variant.costPrice,
      priceSnapshot: variant.salePrice,
      qty: new Prisma.Decimal(line.qty),
      discount: priced.discount,
      lineTotal: priced.lineTotal,
    };
  });

  if (!Number.isInteger(input.billDiscount) || input.billDiscount < 0) {
    throw new UserError("Bill discount must be whole rupees");
  }
  const totals = cartTotals(
    lines.map((line) => line.lineTotal),
    input.billDiscount,
  );
  if (input.billDiscount > totals.subtotal) {
    throw new UserError("Bill discount is more than the subtotal");
  }
  const shares = splitBillDiscount(
    lines.map((line) => line.lineTotal),
    totals.discount,
  );
  const items = lines.map((line, index) => ({
    ...line,
    billDiscountShare: shares[index],
    netTotal: line.lineTotal - shares[index],
  }));
  return { items, ...totals };
}

async function checkCustomer(tx: Tx, customerId: string | null | undefined, required: boolean) {
  if (!customerId) {
    if (required) throw new UserError("Pick the customer for this bill");
    return null;
  }
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw new UserError("The customer no longer exists");
  return customer.id;
}

async function lockHeld(tx: Tx, heldSaleId: string) {
  await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${heldSaleId}::uuid FOR UPDATE`;
  const held = await tx.sale.findUnique({ where: { id: heldSaleId }, select: { status: true } });
  if (!held || held.status !== "HELD")
    throw new UserError("This held bill was already completed or discarded");
}

/**
 * Completes a sale in one transaction: bill number, items with snapshots, the
 * payments in CashFlow, and stock leaving the shelf. Nothing is saved if any
 * step fails.
 */
export async function completeSale(input: CompleteInput, userId: string) {
  return db.$transaction(async (tx) => {
    await requireOpenDay(tx);
    const customerId = await checkCustomer(tx, input.customerId, true);
    const priced = await priceCart(tx, input);

    let credit = 0;
    let exchangeReturnId: string | null = null;
    if (input.exchange) {
      const ret = await createReturnTx(tx, {
        type: "EXCHANGE",
        originalSaleId: input.exchange.originalSaleId,
        items: input.exchange.items,
        userId,
      });
      credit = ret.refundAmount;
      exchangeReturnId = ret.id;
    }

    for (const payment of input.payments) {
      if (!PAYMENT_METHODS.includes(payment.method)) throw new UserError("Unknown payment method");
      if (!Number.isInteger(payment.amount) || payment.amount <= 0) {
        throw new UserError("Payment amounts must be whole rupees above 0");
      }
    }
    const paid = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const due = Math.max(0, priced.total - credit);
    if (paid !== due) {
      throw new UserError(
        paid < due
          ? `Rs ${due - paid} is still unpaid`
          : `Payments are Rs ${paid - due} more than the bill`,
      );
    }

    const cashPaid = input.payments
      .filter((payment) => payment.method === "CASH")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const cashReceived = cashPaid > 0 ? (input.cashReceived ?? cashPaid) : null;
    if (cashReceived !== null && (!Number.isInteger(cashReceived) || cashReceived < cashPaid)) {
      throw new UserError(`Cash received must be at least Rs ${cashPaid}`);
    }

    const counter = await tx.counter.upsert({
      where: { key: "bill" },
      create: { key: "bill", value: 1 },
      update: { value: { increment: 1 } },
    });

    const data = {
      status: "COMPLETED" as const,
      billNo: counter.value,
      customerId,
      userId,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      cashReceived,
      changeGiven: cashReceived !== null ? cashReceived - cashPaid : null,
      note: input.note?.trim() || null,
      completedAt: new Date(),
    };

    let saleId: string;
    if (input.heldSaleId) {
      await lockHeld(tx, input.heldSaleId);
      await tx.saleItem.deleteMany({ where: { saleId: input.heldSaleId } });
      saleId = (await tx.sale.update({ where: { id: input.heldSaleId }, data })).id;
    } else {
      saleId = (await tx.sale.create({ data })).id;
    }

    await tx.saleItem.createMany({ data: priced.items.map((item) => ({ ...item, saleId })) });

    const flows: Prisma.CashFlowCreateManyInput[] = input.payments.map((payment) => ({
      type: "SALE",
      method: payment.method,
      amount: payment.amount,
      saleId,
      customerId: payment.method === "CREDIT" ? customerId : null,
      userId,
    }));
    if (credit > 0) {
      flows.push({ type: "SALE", method: "EXCHANGE", amount: credit, saleId, userId });
      // Returned goods worth more than the new ones: the difference goes back in cash.
      if (credit > priced.total) {
        flows.push({ type: "SALE", method: "CASH", amount: priced.total - credit, saleId, userId });
      }
    }
    await tx.cashFlow.createMany({ data: flows });

    if (exchangeReturnId) {
      await tx.saleReturn.update({
        where: { id: exchangeReturnId },
        data: { exchangeSaleId: saleId },
      });
    }

    for (const item of priced.items) {
      await applyMovement(tx, {
        variantId: item.variantId,
        type: "SALE",
        qty: item.qty.negated(),
        saleId,
      });
    }

    return {
      id: saleId,
      billNo: counter.value,
      total: priced.total,
      change: data.changeGiven ?? 0,
      exchangeRefund: credit > priced.total ? credit - priced.total : 0,
    };
  });
}

/** Parks a bill without touching stock or money. Prices are refreshed when it is completed. */
export async function holdSale(input: CartInput, userId: string) {
  return db.$transaction(async (tx) => {
    const customerId = await checkCustomer(tx, input.customerId, false);
    const priced = await priceCart(tx, input, { requireStockable: false });
    const data = {
      status: "HELD" as const,
      customerId,
      userId,
      subtotal: priced.subtotal,
      discount: priced.discount,
      total: priced.total,
      note: input.note?.trim() || null,
    };
    let saleId: string;
    if (input.heldSaleId) {
      await lockHeld(tx, input.heldSaleId);
      await tx.saleItem.deleteMany({ where: { saleId: input.heldSaleId } });
      saleId = (await tx.sale.update({ where: { id: input.heldSaleId }, data })).id;
    } else {
      saleId = (await tx.sale.create({ data })).id;
    }
    await tx.saleItem.createMany({ data: priced.items.map((item) => ({ ...item, saleId })) });
    return { id: saleId };
  });
}

export async function discardHeldSale(saleId: string) {
  return db.$transaction(async (tx) => {
    await lockHeld(tx, saleId);
    await tx.saleItem.deleteMany({ where: { saleId } });
    await tx.sale.delete({ where: { id: saleId } });
  });
}

export async function listHeldSales() {
  const sales = await db.sale.findMany({
    where: { status: "HELD" },
    orderBy: { createdAt: "asc" },
    include: {
      customer: { select: { name: true } },
      user: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });
  return sales.map((sale) => ({
    id: sale.id,
    createdAt: sale.createdAt,
    customerName: sale.customer?.name ?? null,
    userName: sale.user.name,
    itemCount: sale._count.items,
    total: sale.total,
  }));
}

/** A held bill as POS cart lines, with today's prices and stock. */
export async function getHeldSale(saleId: string) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: { orderBy: { id: "asc" } },
    },
  });
  if (!sale || sale.status !== "HELD") return null;
  const variants = await getPosVariants(sale.items.map((item) => item.variantId));
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  return {
    id: sale.id,
    customer: sale.customer,
    billDiscount: sale.discount,
    note: sale.note,
    lines: sale.items.flatMap((item) => {
      const variant = byId.get(item.variantId);
      return variant ? [{ variant, qty: item.qty.toString(), discount: item.discount }] : [];
    }),
  };
}

export type PosVariant = {
  id: string;
  code: string;
  name: string;
  label: string;
  unit: "PIECE" | "BOTTLE" | "METER" | "ML" | "GRAM";
  price: number;
  stockQty: string;
  isActive: boolean;
  productDiscount: { type: "AMOUNT" | "PERCENT"; value: number } | null;
};

const posInclude = {
  product: {
    select: {
      name: true,
      unit: true,
      isActive: true,
      discountType: true,
      discountValue: true,
      category: { select: { attributes: { select: { name: true, sortOrder: true } } } },
    },
  },
} as const;

type PosRow = Prisma.VariantGetPayload<{ include: typeof posInclude }>;

function toPosVariant(variant: PosRow): PosVariant {
  return {
    id: variant.id,
    code: variant.code,
    name: variant.product.name,
    label: variantLabel(
      variant.attributes as Record<string, string>,
      variant.product.category.attributes,
    ),
    unit: variant.product.unit,
    price: variant.salePrice,
    stockQty: variant.stockQty.toString(),
    isActive: variant.isActive && variant.product.isActive,
    productDiscount:
      variant.product.discountType && variant.product.discountValue
        ? { type: variant.product.discountType, value: variant.product.discountValue }
        : null,
  };
}

export async function getPosVariants(ids: string[]) {
  const rows = await db.variant.findMany({ where: { id: { in: ids } }, include: posInclude });
  return rows.map(toPosVariant);
}

/** Exact code first (a scan), otherwise active items whose name or code matches. */
export async function lookupForPos(term: string) {
  const text = term.trim();
  if (!text) return { exact: null, matches: [] };
  const exact = await db.variant.findUnique({
    where: { code: text.toUpperCase() },
    include: posInclude,
  });
  if (exact) return { exact: toPosVariant(exact), matches: [] };
  const rows = await db.variant.findMany({
    where: {
      isActive: true,
      product: { isActive: true },
      OR: [
        { code: { contains: text.toUpperCase() } },
        { product: { name: { contains: text, mode: "insensitive" } } },
      ],
    },
    include: posInclude,
    orderBy: [{ product: { name: "asc" } }, { code: "asc" }],
    take: 12,
  });
  return { exact: null, matches: rows.map(toPosVariant) };
}
