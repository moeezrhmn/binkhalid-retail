import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "POS / Billing" };

export default function PosPage() {
  return (
    <>
      <PageHeader title="POS / Billing" description="Scan items and complete sales." />
      <ComingSoon
        phase={3}
        items={[
          "Scan or search by name or code",
          "Cart with quantity, discounts and payments",
          "Hold and resume bills",
          "Thermal receipt printing",
        ]}
      />
    </>
  );
}
