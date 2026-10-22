import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Sales, profit and stock at a glance." />
      <ComingSoon
        phase={4}
        items={[
          "Sales, bills, profit and udhaar outstanding",
          "Sales charts and top products",
          "Low-stock alerts",
        ]}
      />
    </>
  );
}
