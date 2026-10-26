import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Barcode, Copy, Pencil } from "lucide-react";
import { AddVariants } from "@/components/products/add-variants";
import { VariantsEditor } from "@/components/products/variants-editor";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatRs } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { variantKey } from "@/lib/variants";
import { toAttributeForm } from "@/server/services/categories";
import { getProduct } from "@/server/services/products";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params, searchParams }: PageProps<"/products/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const { variant } = await searchParams;
  const product = /^[0-9a-f-]{36}$/.test(id) ? await getProduct(id) : null;
  if (!product) notFound();

  const unitLabel = UNIT_LABELS[product.unit].toLowerCase();
  const labelIds = product.variants.filter((v) => v.isActive).map((v) => v.id);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-5">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- uploads are served behind login, not via the image optimizer
            <img
              src={product.imageUrl}
              alt=""
              className="size-24 rounded-lg border border-gray-200 object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">{product.name}</h2>
              {product.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
              <div>
                <dt className="inline text-gray-400">Category </dt>
                <dd className="inline">{product.category.name}</dd>
              </div>
              <div>
                <dt className="inline text-gray-400">Sold by </dt>
                <dd className="inline">{UNIT_LABELS[product.unit]}</dd>
              </div>
              <div>
                <dt className="inline text-gray-400">Discount </dt>
                <dd className="inline">
                  {product.discountType === "PERCENT"
                    ? `${product.discountValue}% off`
                    : product.discountType === "AMOUNT"
                      ? `${formatRs(product.discountValue ?? 0)} off`
                      : "None"}
                </dd>
              </div>
            </dl>
            {product.description ? (
              <p className="text-sm text-gray-600">{product.description}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/products/${product.id}/edit`}
              className={buttonClasses({ variant: "secondary" })}
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </Link>
            <Link
              href={`/products/new?from=${product.id}`}
              className={buttonClasses({ variant: "secondary" })}
            >
              <Copy className="size-4" aria-hidden /> Duplicate
            </Link>
            {labelIds.length ? (
              <Link href={`/barcodes?variants=${labelIds.join(",")}`} className={buttonClasses()}>
                <Barcode className="size-4" aria-hidden /> Print labels
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <VariantsEditor
          productId={product.id}
          variants={product.variants}
          highlightId={typeof variant === "string" ? variant : undefined}
          unitLabel={unitLabel}
        />
      </Card>

      {product.category.attributes.length > 0 ? (
        <AddVariants
          productId={product.id}
          prefix={product.category.codePrefix}
          attributes={product.category.attributes.map((attribute) => ({
            ...toAttributeForm(attribute),
            sortOrder: attribute.sortOrder,
          }))}
          existingKeys={product.variants.map((v) => variantKey(v.values))}
        />
      ) : null}
    </div>
  );
}
