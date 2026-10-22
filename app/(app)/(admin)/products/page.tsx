import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Products" };

export default function ProductsPage() {
  return (
    <>
      <PageHeader title="Products" description="Categories, products and variants." />
      <ComingSoon
        phase={2}
        items={[
          "Categories and attributes",
          "Products with variant generator and codes",
          "Quick add grid for fast entry",
        ]}
      />
    </>
  );
}
