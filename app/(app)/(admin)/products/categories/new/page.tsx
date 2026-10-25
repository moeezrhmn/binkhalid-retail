import type { Metadata } from "next";
import { CategoryForm } from "@/components/products/category-form";

export const metadata: Metadata = { title: "New category" };

export default function NewCategoryPage() {
  return (
    <CategoryForm
      initial={{ name: "", codePrefix: "", defaultUnit: "PIECE", isActive: true, attributes: [] }}
      productCount={0}
    />
  );
}
