import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Sales, stock, profit and cash reports." />
      <ComingSoon
        phase={4}
        items={[
          "Sales by product, category, payment method and staff",
          "Profit, stock and slow-moving reports",
          "Daily cash summary and cash flow",
          "Excel and PDF export",
        ]}
      />
    </>
  );
}
