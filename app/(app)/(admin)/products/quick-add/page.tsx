import type { Metadata } from "next";
import { QuickAddGrid } from "@/components/products/quick-add-grid";
import { formCategories } from "@/server/services/catalog-forms";

export const metadata: Metadata = { title: "Quick add" };

export default async function QuickAddPage({ searchParams }: PageProps<"/products/quick-add">) {
  const { category } = await searchParams;
  const categories = await formCategories();
  return (
    <QuickAddGrid
      categories={categories}
      initialCategoryId={typeof category === "string" ? category : undefined}
    />
  );
}
