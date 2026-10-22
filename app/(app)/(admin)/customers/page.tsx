import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" description="Customers, udhaar balances and statements." />
      <ComingSoon
        phase={4}
        items={[
          "Customer list and purchase history",
          "Udhaar balances and statements",
          "Receive payments",
        ]}
      />
    </>
  );
}
