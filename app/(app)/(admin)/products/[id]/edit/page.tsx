import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailsForm } from "@/components/products/product-details-form";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/products/[id]/edit">) {
  const { id } = await params;
  const product = /^[0-9a-f-]{36}$/.test(id)
    ? await db.product.findUnique({
        where: { id },
        include: { category: { select: { name: true } } },
      })
    : null;
  if (!product) notFound();

  return (
    <ProductDetailsForm
      product={{
        id: product.id,
        categoryName: product.category.name,
        name: product.name,
        description: product.description ?? "",
        unit: product.unit,
        discountType: product.discountType,
        discountValue: product.discountValue,
        isActive: product.isActive,
        imageUrl: product.imageUrl,
      }}
    />
  );
}
