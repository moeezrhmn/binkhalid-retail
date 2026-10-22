import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Barcode Labels" };

export default function BarcodesPage() {
  return (
    <>
      <PageHeader title="Barcode Labels" description="Print barcode labels for any variant." />
      <ComingSoon
        phase={2}
        items={[
          "Pick variants and copies",
          "Label preview and printing",
          "Labels for stock added today",
        ]}
      />
    </>
  );
}
