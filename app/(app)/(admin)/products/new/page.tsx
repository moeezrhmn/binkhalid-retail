import type { Metadata } from "next";
import { ProductForm } from "@/components/products/product-form";
import { formCategories } from "@/server/services/catalog-forms";
import { getProductDraft } from "@/server/services/products";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "New product" };

const UUID = /^[0-9a-f-]{36}$/;

export default async function NewProductPage({ searchParams }: PageProps<"/products/new">) {
  await requireAdmin();
  const { category, from } = await searchParams;
  const [categories, draft] = await Promise.all([
    formCategories(),
    typeof from === "string" && UUID.test(from) ? getProductDraft(from) : null,
  ]);

  return (
    <ProductForm
      categories={categories}
      initialCategoryId={typeof category === "string" ? category : undefined}
      draft={draft && categories.some((c) => c.id === draft.categoryId) ? draft : undefined}
    />
  );
}
