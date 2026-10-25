import "server-only";
import type { FormCategory } from "@/components/products/product-form";
import { listCategories, toAttributeForm } from "./categories";

/** Active categories shaped for the product forms. */
export async function formCategories(): Promise<FormCategory[]> {
  const categories = await listCategories({ activeOnly: true });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    codePrefix: category.codePrefix,
    defaultUnit: category.defaultUnit,
    attributes: category.attributes.map((attribute) => ({
      ...toAttributeForm(attribute),
      sortOrder: attribute.sortOrder,
    })),
  }));
}
