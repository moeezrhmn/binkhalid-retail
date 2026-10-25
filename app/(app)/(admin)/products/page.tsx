import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ScanLine } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatQty, formatRs } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { listCategories } from "@/server/services/categories";
import { findVariantByCode, listProducts } from "@/server/services/products";

export const metadata: Metadata = { title: "Products" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  const params = await searchParams;
  const q = one(params.q)?.trim() ?? "";
  const categoryId = one(params.category);
  const status = one(params.status) === "inactive" ? "inactive" : "active";
  const lowStock = one(params.stock) === "low";
  const page = Number(one(params.page)) || 1;

  // A scanned or typed code that matches exactly opens that variant straight away.
  if (q && /^[a-z0-9-]+$/i.test(q)) {
    const match = await findVariantByCode(q);
    if (match) redirect(`/products/${match.productId}?variant=${match.id}`);
  }

  const [categories, result] = await Promise.all([
    listCategories(),
    listProducts({ q, categoryId, status, lowStock, page }),
  ]);

  const query = {
    q: q || undefined,
    category: categoryId,
    status: status === "inactive" ? status : undefined,
    stock: lowStock ? "low" : undefined,
  };
  const hrefWith = (change: Partial<typeof query>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...change }))
      if (value) search.set(key, value);
    const text = search.toString();
    return text ? `/products?${text}` : "/products";
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
      active
        ? "border-brand-700 bg-brand-700 text-white"
        : "border-gray-300 bg-white text-gray-700 hover:border-brand-600",
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action="/products" className="relative min-w-0 flex-1 basis-72">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Scan a barcode or search by name or code"
            aria-label="Scan a barcode or search products"
            autoFocus
            className="pl-10"
          />
          {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
        </form>
        <Link href="/products/new" className={buttonClasses()}>
          <Plus className="size-4" aria-hidden /> New product
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link href={hrefWith({ category: undefined })} className={chip(!categoryId)}>
          All
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={hrefWith({ category: category.id })}
            className={chip(categoryId === category.id)}
          >
            {category.name}
          </Link>
        ))}
        <span className="mx-1 border-l border-gray-200" aria-hidden />
        <Link href={hrefWith({ stock: lowStock ? undefined : "low" })} className={chip(lowStock)}>
          Low stock
        </Link>
        <Link
          href={hrefWith({ status: status === "inactive" ? undefined : "inactive" })}
          className={chip(status === "inactive")}
        >
          Inactive
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH>Category</TH>
              <TH className="text-right">Variants</TH>
              <TH className="text-right">Stock</TH>
              <TH className="text-right">Price</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {result.items.map((product) => (
              <TR key={product.id}>
                <TD>
                  <Link
                    href={`/products/${product.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {product.name}
                  </Link>
                </TD>
                <TD className="text-gray-600">{product.categoryName}</TD>
                <TD className="text-right">{product.variantCount}</TD>
                <TD className="text-right whitespace-nowrap">
                  {formatQty(product.totalStock)}{" "}
                  <span className="text-gray-400">{UNIT_LABELS[product.unit].toLowerCase()}</span>
                </TD>
                <TD className="text-right whitespace-nowrap">
                  {product.priceMin === null
                    ? "–"
                    : product.priceMin === product.priceMax
                      ? formatRs(product.priceMin)
                      : `${formatRs(product.priceMin)} – ${formatRs(product.priceMax!)}`}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {!product.isActive ? <Badge>Inactive</Badge> : null}
                    {product.outOfStock > 0 ? (
                      <Badge tone="red">{product.outOfStock} out</Badge>
                    ) : null}
                    {product.lowStock > 0 ? (
                      <Badge tone="gold">{product.lowStock} low</Badge>
                    ) : null}
                    {product.isActive && product.outOfStock + product.lowStock === 0 ? (
                      <Badge tone="green">In stock</Badge>
                    ) : null}
                  </div>
                </TD>
              </TR>
            ))}
            {result.items.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-gray-500">
                  {q ? `Nothing matches "${q}".` : "No products here yet."}{" "}
                  <Link href="/products/new" className="text-brand-700 underline">
                    Add a product
                  </Link>
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>

      <Pagination page={result.page} pageCount={result.pageCount} params={query} />
    </div>
  );
}
