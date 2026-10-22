import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <>
      <PageHeader title="Inventory" description="Stock levels, stock in and adjustments." />
      <ComingSoon
        phase={3}
        items={[
          "Stock levels with low-stock filter",
          "Stock in and adjustments",
          "Movement history and suppliers",
        ]}
      />
    </>
  );
}
