import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { METHOD_LABELS } from "@/lib/cart";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/format";
import { requireOpenDay } from "./cash";
import { isUniqueViolation, UserError } from "./errors";

export type CustomerOption = { id: string; name: string; phone: string | null };

const select = { id: true, name: true, phone: true } as const;

/** Phone digits match from the start (instant lookup while typing); otherwise by name. */
export async function searchCustomers(q: string, take = 8): Promise<CustomerOption[]> {
  const term = q.trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, "");
  const looksLikePhone = digits.length >= 3 && digits.length >= term.replace(/\s/g, "").length - 2;

  if (looksLikePhone) {
    const local = digits.startsWith("92")
      ? `0${digits.slice(2)}`
      : digits.startsWith("3")
        ? `0${digits}`
        : digits;
    return db.customer.findMany({
      where: { phone: { startsWith: local } },
      orderBy: { name: "asc" },
      take,
      select,
    });
  }
  return db.customer.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take,
    select,
  });
}

/** Existing customers whose name looks like this one, shown before adding a customer without a phone. */
export async function similarCustomers(name: string): Promise<CustomerOption[]> {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2);
  if (words.length === 0) return [];
  return db.customer.findMany({
    where: {
      AND: words.map((word) => ({ name: { contains: word, mode: "insensitive" as const } })),
    },
    orderBy: { name: "asc" },
    take: 5,
    select,
  });
}

export async function quickAddCustomer(input: {
  name: string;
  phone?: string | null;
}): Promise<CustomerOption> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new UserError("Enter the customer's name");
  const phone = normalizePhone(input.phone);
  if (phone && !/^0\d{9,11}$/.test(phone))
    throw new UserError("Enter a valid phone number, e.g. 0300 1234567");

  if (phone) {
    const existing = await db.customer.findUnique({ where: { phone }, select });
    if (existing) throw new UserError(`${phone} already belongs to ${existing.name}`);
  }
  try {
    return await db.customer.create({ data: { name, phone }, select });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new UserError(`${phone} is already used by another customer`);
    throw error;
  }
}

export async function getCustomerOption(id: string): Promise<CustomerOption | null> {
  return db.customer.findUnique({ where: { id }, select });
}

// ----- Customer records and udhaar (credit) -----
//
// A customer's udhaar balance is never stored: it is the sum of their CREDIT
// rows (udhaar sales, opening balance, udhaar refunds as negatives) minus the
// sum of their CREDIT_RECEIVED rows (payments).

type BalanceRow = { customerId: string; balance: number };

async function balancesFor(ids: string[] | null): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<BalanceRow[]>`
    SELECT "customerId",
           (COALESCE(SUM(amount) FILTER (WHERE method = 'CREDIT'), 0)
          - COALESCE(SUM(amount) FILTER (WHERE type = 'CREDIT_RECEIVED'), 0))::int AS balance
    FROM "CashFlow"
    WHERE "customerId" IS NOT NULL
      ${ids ? Prisma.sql`AND "customerId" = ANY(${ids}::uuid[])` : Prisma.empty}
    GROUP BY "customerId"`;
  return new Map(rows.map((row) => [row.customerId, Number(row.balance)]));
}

export async function customerBalance(customerId: string) {
  return (await balancesFor([customerId])).get(customerId) ?? 0;
}

/** Total udhaar owed to the shop (customers who owe; advances are not netted off). */
export async function totalOutstanding() {
  const balances = await balancesFor(null);
  return [...balances.values()].filter((b) => b > 0).reduce((sum, b) => sum + b, 0);
}

export async function listCustomers(filter: {
  q?: string;
  owing?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = filter.pageSize ?? 30;
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim() ?? "";
  const digits = q.replace(/\D/g, "");
  const phone = normalizePhone(q);

  let owingIds: string[] | undefined;
  if (filter.owing) {
    const balances = await balancesFor(null);
    owingIds = [...balances].filter(([, b]) => b > 0).map(([id]) => id);
  }

  const where: Prisma.CustomerWhereInput = {
    ...(owingIds ? { id: { in: owingIds } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(digits.length >= 3 && phone
              ? [{ phone: { contains: phone.replace(/^0/, "") } }]
              : []),
          ],
        }
      : {}),
  };

  const [total, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { sales: { where: { status: "COMPLETED" } } } } },
    }),
  ]);
  const ids = customers.map((c) => c.id);
  const [balances, last] = await Promise.all([
    balancesFor(ids),
    db.sale.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, status: "COMPLETED" },
      _max: { completedAt: true },
    }),
  ]);
  const lastPurchase = new Map(last.map((row) => [row.customerId, row._max.completedAt]));

  return {
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      billCount: c._count.sales,
      balance: balances.get(c.id) ?? 0,
      lastPurchase: lastPurchase.get(c.id) ?? null,
    })),
  };
}

function cleanCustomer(input: { name: string; phone?: string | null; notes?: string | null }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new UserError("Enter the customer's name");
  const phone = normalizePhone(input.phone);
  if (phone && !/^0\d{9,11}$/.test(phone)) {
    throw new UserError("Enter a valid phone number, e.g. 0300 1234567");
  }
  return { name, phone, notes: input.notes?.trim().slice(0, 300) || null };
}

export async function createCustomer(
  input: { name: string; phone?: string | null; notes?: string | null; openingBalance?: number },
  userId: string,
) {
  const data = cleanCustomer(input);
  const opening = input.openingBalance ?? 0;
  if (!Number.isInteger(opening) || opening < 0) {
    throw new UserError("Old udhaar must be whole rupees, 0 or more");
  }
  try {
    return await db.$transaction(async (tx) => {
      const customer = await tx.customer.create({ data, select });
      if (opening > 0) {
        await tx.cashFlow.create({
          data: {
            type: "OPENING_BALANCE",
            method: "CREDIT",
            amount: opening,
            customerId: customer.id,
            userId,
            note: "Udhaar from before this system",
          },
        });
      }
      return customer;
    });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new UserError(`${data.phone} already belongs to another customer`);
    throw error;
  }
}

export async function updateCustomer(
  customerId: string,
  input: { name: string; phone?: string | null; notes?: string | null },
) {
  const data = cleanCustomer(input);
  try {
    return await db.customer.update({ where: { id: customerId }, data, select });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new UserError(`${data.phone} already belongs to another customer`);
    throw error;
  }
}

export const RECEIVE_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA"] as const;

/** Records udhaar paid back. Never more than the customer owes, to catch typing mistakes. */
export async function receivePayment(
  input: {
    customerId: string;
    amount: number;
    method: (typeof RECEIVE_METHODS)[number];
    note?: string | null;
  },
  userId: string,
) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new UserError("Enter the amount received in whole rupees");
  }
  if (!RECEIVE_METHODS.includes(input.method)) throw new UserError("Pick how the money was paid");
  return db.$transaction(async (tx) => {
    await requireOpenDay(tx);
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${input.customerId}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw new UserError("This customer no longer exists");
    const [row] = await tx.$queryRaw<{ balance: number }[]>`
      SELECT (COALESCE(SUM(amount) FILTER (WHERE method = 'CREDIT'), 0)
            - COALESCE(SUM(amount) FILTER (WHERE type = 'CREDIT_RECEIVED'), 0))::int AS balance
      FROM "CashFlow" WHERE "customerId" = ${input.customerId}::uuid`;
    const balance = Number(row?.balance ?? 0);
    if (input.amount > balance) {
      throw new UserError(
        balance > 0 ? `${customer.name} owes only Rs ${balance}` : `${customer.name} owes nothing`,
      );
    }
    return tx.cashFlow.create({
      data: {
        type: "CREDIT_RECEIVED",
        method: input.method,
        amount: input.amount,
        customerId: customer.id,
        userId,
        note: input.note?.trim().slice(0, 200) || null,
      },
    });
  });
}

export type StatementEntry = {
  id: string;
  date: Date;
  description: string;
  charge: number;
  payment: number;
  balance: number;
  saleId: string | null;
};

/** Every udhaar movement in date order with a running balance. */
export async function customerStatement(customerId: string): Promise<StatementEntry[]> {
  const rows = await db.cashFlow.findMany({
    where: {
      customerId,
      OR: [{ method: "CREDIT" }, { type: "CREDIT_RECEIVED" }],
    },
    orderBy: { createdAt: "asc" },
    include: {
      sale: { select: { id: true, billNo: true } },
      saleReturn: {
        select: { returnNo: true, originalSale: { select: { id: true, billNo: true } } },
      },
    },
  });

  let balance = 0;
  return rows.map((row) => {
    const isPayment = row.type === "CREDIT_RECEIVED";
    const change = isPayment ? -row.amount : row.amount;
    balance += change;
    const description =
      row.type === "OPENING_BALANCE"
        ? "Old udhaar (before this system)"
        : row.type === "SALE"
          ? `Udhaar on bill #${row.sale?.billNo}`
          : row.type === "REFUND"
            ? `Return #${row.saleReturn?.returnNo}${row.saleReturn?.originalSale ? ` (bill #${row.saleReturn.originalSale.billNo})` : ""}`
            : `Payment received (${METHOD_LABELS[row.method]})${row.note ? `: ${row.note}` : ""}`;
    return {
      id: row.id,
      date: row.createdAt,
      description,
      charge: change > 0 ? change : 0,
      payment: change < 0 ? -change : 0,
      balance,
      saleId: row.sale?.id ?? row.saleReturn?.originalSale?.id ?? null,
    };
  });
}

export async function customerPurchases(customerId: string, take = 50) {
  const sales = await db.sale.findMany({
    where: { customerId, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    take,
    include: {
      _count: { select: { items: true, returns: true } },
      cashFlows: { where: { type: "SALE" }, select: { method: true, amount: true } },
    },
  });
  return sales.map((sale) => ({
    id: sale.id,
    billNo: sale.billNo!,
    completedAt: sale.completedAt!,
    itemCount: sale._count.items,
    total: sale.total,
    udhaar: sale.cashFlows.filter((f) => f.method === "CREDIT").reduce((s, f) => s + f.amount, 0),
    returned: sale._count.returns > 0,
  }));
}

export async function getCustomer(customerId: string) {
  return db.customer.findUnique({ where: { id: customerId } });
}
