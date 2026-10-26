import type { Metadata } from "next";
import { PosScreen } from "@/components/pos/pos-screen";
import { requireUser } from "@/lib/auth";
import { previewExchange } from "@/server/services/returns";

export const metadata: Metadata = { title: "POS / Billing" };

/** exchange=<saleId>&items=<saleItemId>:<qty>:<1 restock | 0>,… (admin only, from a bill's Return page) */
async function loadExchange(sale: unknown, items: unknown) {
  if (typeof sale !== "string" || typeof items !== "string" || !/^[0-9a-f-]{36}$/.test(sale)) {
    return null;
  }
  const parsed = items
    .split(",")
    .slice(0, 100)
    .flatMap((part) => {
      const [saleItemId, qty, restock] = part.split(":");
      return /^[0-9a-f-]{36}$/.test(saleItemId) && qty
        ? [{ saleItemId, qty, restock: restock !== "0" }]
        : [];
    });
  return parsed.length ? previewExchange(sale, parsed) : null;
}

export default async function PosPage({ searchParams }: PageProps<"/pos">) {
  const user = await requireUser();
  const { exchange, items, saved, back } = await searchParams;
  const exchangeDraft = user.type === "ADMIN" ? await loadExchange(exchange, items) : null;
  const savedBill =
    typeof saved === "string" && /^\d+$/.test(saved)
      ? { billNo: Number(saved), giveBack: typeof back === "string" ? Number(back) || 0 : 0 }
      : null;

  return (
    <PosScreen
      key={
        exchangeDraft
          ? `exchange-${exchangeDraft.originalSaleId}`
          : `sale-${savedBill?.billNo ?? ""}`
      }
      userName={user.name}
      userRole={user.type}
      exchange={exchangeDraft}
      saved={exchangeDraft ? null : savedBill}
    />
  );
}
