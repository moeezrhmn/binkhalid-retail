import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReturnForm } from "@/components/sales/return-form";
import type { SalePaymentMethod } from "@/lib/cart";
import { currentSession } from "@/server/services/cash";
import { getSaleDetail } from "@/server/services/sales-history";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Return" };

export default async function ReturnPage({ params }: PageProps<"/sales/[id]/return">) {
  await requireAdmin();
  const { id } = await params;
  const sale = /^[0-9a-f-]{36}$/.test(id) ? await getSaleDetail(id) : null;
  if (!sale) notFound();

  // Refund the way the customer mostly paid.
  const largest = sale.payments
    .filter((p) => p.amount > 0 && p.method !== "EXCHANGE")
    .sort((a, b) => b.amount - a.amount)[0];
  const defaultMethod = (largest?.method ?? "CASH") as SalePaymentMethod;

  return (
    <ReturnForm
      dayOpen={Boolean(await currentSession())}
      sale={{
        id: sale.id,
        billNo: sale.billNo,
        customerName: sale.customer?.name ?? "",
        defaultMethod,
        items: sale.items.map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          unit: item.unit,
          qty: item.qty,
          netTotal: item.netTotal,
          returnableQty: item.returnableQty,
        })),
      }}
    />
  );
}
