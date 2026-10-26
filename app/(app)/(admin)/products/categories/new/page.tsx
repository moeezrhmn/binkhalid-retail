import type { Metadata } from "next";
import { CategoryForm } from "@/components/products/category-form";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "New category" };

export default async function NewCategoryPage() {
  await requireAdmin();
  return (
    <CategoryForm
      initial={{ name: "", codePrefix: "", defaultUnit: "PIECE", isActive: true, attributes: [] }}
      productCount={0}
    />
  );
}
