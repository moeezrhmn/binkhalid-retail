import type { Metadata } from "next";
import Link from "next/link";
import { History, PackagePlus, ScanLine } from "lucide-react";
import { AdjustStockButton } from "@/components/inventory/adjust-dialog";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDateTime, formatQty, formatRs } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { listCategories } from "@/server/services/categories";
import { listStock } from "@/server/services/stock";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Inventory" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function InventoryPage({ searchParams }: PageProps<"/inventory">) {
  await requireAdmin();
  const params = await searchParams;
  const q = one(params.q)?.trim() ?? "";
  const categoryId = one(params.category);
  const lowOnly = one(params.stock) === "low";
  const page = Number(one(params.page)) || 1;

  const [categories, stock] = await Promise.all([
    listCategories(),
    listStock({ q, categoryId, lowOnly, page }),
  ]);

  const query = { q: q || undefined, category: categoryId, stock: lowOnly ? "low" : undefined };
  const hrefWith = (change: Partial<typeof query>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...change }))
      if (value) search.set(key, value);
    const text = search.toString();
    return text ? `/inventory?${text}` : "/inventory";
  };
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-sm whitespace-nowrap",
      active
        ? "border-brand-700 bg-brand-700 text-white"
        : "border-gray-300 bg-white text-gray-700 hover:border-brand-600",
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/inventory" className="relative min-w-0 flex-1 basis-72">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Scan a barcode or search by name or code"
            aria-label="Scan a barcode or search stock"
            autoFocus
            className="pl-8"
          />
          {lowOnly ? <input type="hidden" name="stock" value="low" /> : null}
          {categoryId ? <input type="hidden" name="category" value={categoryId} /> : null}
        </form>
        <Link href="/inventory/stock-in" className={buttonClasses()}>
          <PackagePlus className="size-4" aria-hidden /> Stock in
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
        <Link href={hrefWith({ stock: lowOnly ? undefined : "low" })} className={chip(lowOnly)}>
          Low stock
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Product</TH>
              <TH className="text-right">In stock</TH>
              <TH className="text-right">Min</TH>
              <TH className="text-right">Cost</TH>
              <TH>Status</TH>
              <TH>Last change</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {stock.items.map((item) => {
              const unitLabel = UNIT_LABELS[item.unit].toLowerCase();
              return (
                <TR key={item.id}>
                  <TD className="font-mono text-xs whitespace-nowrap">{item.code}</TD>
                  <TD>
                    <Link
                      href={`/products/${item.productId}?variant=${item.id}`}
                      className="hover:underline"
                    >
                      <span className="font-medium">{item.productName}</span>
                      {item.label ? <span className="text-gray-500"> · {item.label}</span> : null}
                    </Link>
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <span
                      className={cn("font-semibold", Number(item.stockQty) < 0 && "text-red-600")}
                    >
                      {formatQty(item.stockQty)}
                    </span>{" "}
                    <span className="text-gray-400">{unitLabel}</span>
                  </TD>
                  <TD className="text-right text-gray-600">{formatQty(item.minStock)}</TD>
                  <TD className="text-right text-gray-600">{formatRs(item.costPrice)}</TD>
                  <TD>
                    {item.status === "out" ? (
                      <Badge tone="red">Out of stock</Badge>
                    ) : item.status === "low" ? (
                      <Badge tone="gold">Low</Badge>
                    ) : (
                      <Badge tone="green">OK</Badge>
                    )}
                  </TD>
                  <TD className="text-xs whitespace-nowrap text-gray-500">
                    {item.lastChange ? formatDateTime(item.lastChange) : "—"}
                  </TD>
                  <TD className="text-right whitespace-nowrap">
                    <AdjustStockButton
                      variant={{
                        id: item.id,
                        code: item.code,
                        name: item.label ? `${item.productName} · ${item.label}` : item.productName,
                        stockQty: item.stockQty,
                        unitLabel,
                      }}
                    />
                    <Link
                      href={`/inventory/movements?variant=${item.id}`}
                      className={buttonClasses({ variant: "ghost", size: "sm" })}
                    >
                      <History className="size-4" aria-hidden /> History
                    </Link>
                  </TD>
                </TR>
              );
            })}
            {stock.items.length === 0 ? (
              <tr>
                <TD colSpan={8} className="py-10 text-center text-gray-500">
                  {q
                    ? `Nothing matches "${q}".`
                    : lowOnly
                      ? "Nothing is low on stock."
                      : "No stock yet."}
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>

      <Pagination page={stock.page} pageCount={stock.pageCount} params={query} />
    </div>
  );
}
