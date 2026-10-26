import type { Metadata } from "next";
import { StockInForm } from "@/components/inventory/stock-in-form";
import { listSuppliers } from "@/server/services/stock";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Stock in" };

export default async function StockInPage() {
  await requireAdmin();
  const suppliers = await listSuppliers();
  return <StockInForm suppliers={suppliers.map(({ id, name }) => ({ id, name }))} />;
}
