import "server-only";
import { db } from "@/lib/db";

/** Everything printed on a receipt, plus the customer's udhaar balance after the bill. */
export async function getReceipt(saleId: string) {
  const sale = await db.sale.findUnique({
    where: { id: saleId },
    include: {
      items: { orderBy: { id: "asc" } },
      cashFlows: { where: { type: "SALE" }, orderBy: { amount: "desc" } },
      customer: { select: { id: true, name: true, phone: true } },
      user: { select: { name: true } },
    },
  });
  if (!sale || sale.status !== "COMPLETED") return null;

  let udhaarBalance: number | null = null;
  if (sale.customer && sale.cashFlows.some((flow) => flow.method === "CREDIT")) {
    const [charged, received] = await Promise.all([
      db.cashFlow.aggregate({
        where: { customerId: sale.customer.id, method: "CREDIT" },
        _sum: { amount: true },
      }),
      db.cashFlow.aggregate({
        where: { customerId: sale.customer.id, type: "CREDIT_RECEIVED" },
        _sum: { amount: true },
      }),
    ]);
    udhaarBalance = (charged._sum.amount ?? 0) - (received._sum.amount ?? 0);
  }

  return {
    billNo: sale.billNo!,
    completedAt: sale.completedAt!,
    cashier: sale.user.name,
    customer: sale.customer,
    items: sale.items.map((item) => ({
      name: item.nameSnapshot,
      code: item.codeSnapshot,
      qty: item.qty.toString(),
      price: item.priceSnapshot,
      discount: item.discount,
      lineTotal: item.lineTotal,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: sale.cashFlows.map((flow) => ({ method: flow.method, amount: flow.amount })),
    cashReceived: sale.cashReceived,
    changeGiven: sale.changeGiven,
    udhaarBalance,
  };
}
