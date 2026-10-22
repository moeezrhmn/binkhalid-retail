import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return (
    <>
      <PageHeader title="Sales" description="Bill history, reprints and returns." />
      <ComingSoon
        phase={3}
        items={["Bill history with search", "Reprint receipts", "Returns and exchanges"]}
      />
    </>
  );
}
