import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryForm } from "@/components/products/category-form";
import { getCategory, toAttributeForm } from "@/server/services/categories";

export const metadata: Metadata = { title: "Edit category" };

export default async function EditCategoryPage({ params }: PageProps<"/products/categories/[id]">) {
  const { id } = await params;
  const category = /^[0-9a-f-]{36}$/.test(id) ? await getCategory(id) : null;
  if (!category) notFound();

  return (
    <CategoryForm
      initial={{
        id: category.id,
        name: category.name,
        codePrefix: category.codePrefix,
        defaultUnit: category.defaultUnit,
        isActive: category.isActive,
        attributes: category.attributes.map(toAttributeForm),
      }}
      productCount={category._count.products}
    />
  );
}
