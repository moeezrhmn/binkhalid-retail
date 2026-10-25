import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/format";
import { qtyToMilli } from "@/lib/money";

export async function listSales(filter: {
  range: DateRange;
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  const pageSize = filter.pageSize ?? 30;
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim() ?? "";
  const billNo = /^#?\d{1,9}$/.test(q) ? Number(q.replace("#", "")) : null;
  const phone = normalizePhone(q);

  const where: Prisma.SaleWhereInput = {
    status: "COMPLETED",
    ...(billNo !== null
      ? { billNo }
      : {
          completedAt: { gte: filter.range.from, lt: filter.range.to },
          ...(q
            ? {
                customer: {
                  OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    ...(phone && phone.length >= 4 ? [{ phone: { startsWith: phone } }] : []),
                  ],
                },
              }
            : {}),
        }),
  };

  const [total, sum, sales] = await Promise.all([
    db.sale.count({ where }),
    db.sale.aggregate({ where, _sum: { total: true } }),
    db.sale.findMany({
      where,
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { name: true, phone: true } },
        user: { select: { name: true } },
        cashFlows: { where: { type: "SALE" }, select: { method: true, amount: true } },
        _count: { select: { items: true, returns: true } },
      },
    }),
  ]);

  return {
    total,
    totalAmount: sum._sum.total ?? 0,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    items: sales.map((sale) => ({
      id: sale.id,
      billNo: sale.billNo!,
      completedAt: sale.completedAt!,
      customerName: sale.customer?.name ?? "",
      userName: sale.user.name,
      itemCount: sale._count.items,
      total: sale.total,
      methods: [...new Set(sale.cashFlows.filter((f) => f.amount > 0).map((f) => f.method))],
      returned: sale._count.returns > 0,
    })),
  };
}

export async function getSaleDetail(saleId: string) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      user: { select: { name: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          returnItems: { select: { qty: true } },
          variant: { select: { product: { select: { unit: true } } } },
        },
      },
      cashFlows: { where: { type: "SALE" }, orderBy: { amount: "desc" } },
      returns: {
        orderBy: { createdAt: "asc" },
        include: {
          cashFlows: { select: { method: true, amount: true } },
          _count: { select: { items: true } },
        },
      },
      exchangeReturn: {
        select: { returnNo: true, originalSale: { select: { id: true, billNo: true } } },
      },
    },
  });
  if (!sale || sale.status !== "COMPLETED") return null;

  return {
    id: sale.id,
    billNo: sale.billNo!,
    completedAt: sale.completedAt!,
    customer: sale.customer,
    userName: sale.user.name,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    cashReceived: sale.cashReceived,
    changeGiven: sale.changeGiven,
    note: sale.note,
    payments: sale.cashFlows.map((flow) => ({ method: flow.method, amount: flow.amount })),
    items: sale.items.map((item) => {
      const soldMilli = qtyToMilli(item.qty.toString());
      const returnedMilli = item.returnItems.reduce(
        (sum, r) => sum + qtyToMilli(r.qty.toString()),
        0,
      );
      return {
        id: item.id,
        variantId: item.variantId,
        name: item.nameSnapshot,
        code: item.codeSnapshot,
        unit: item.variant.product.unit,
        qty: item.qty.toString(),
        price: item.priceSnapshot,
        discount: item.discount,
        lineTotal: item.lineTotal,
        billDiscountShare: item.billDiscountShare,
        netTotal: item.netTotal,
        returnedQty: String(returnedMilli / 1000),
        returnableQty: String((soldMilli - returnedMilli) / 1000),
      };
    }),
    returns: sale.returns.map((ret) => ({
      id: ret.id,
      returnNo: ret.returnNo,
      type: ret.type,
      createdAt: ret.createdAt,
      refundAmount: ret.refundAmount,
      itemCount: ret._count.items,
      methods: ret.cashFlows.map((flow) => ({ method: flow.method, amount: -flow.amount })),
    })),
    exchangedFrom: sale.exchangeReturn[0]?.originalSale ?? null,
  };
}
