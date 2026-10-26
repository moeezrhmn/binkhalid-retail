import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { UNIT_LABELS } from "@/lib/units";
import { listCategories } from "@/server/services/categories";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireAdmin();
  const categories = await listCategories();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Each category decides which attributes its products have and how their codes look.
        </p>
        <Link href="/products/categories/new" className={buttonClasses()}>
          <Plus className="size-4" aria-hidden /> New category
        </Link>
      </div>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Category</TH>
              <TH>Prefix</TH>
              <TH>Unit</TH>
              <TH>Attributes</TH>
              <TH className="text-right">Products</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {categories.map((category) => (
              <TR key={category.id}>
                <TD>
                  <Link
                    href={`/products/categories/${category.id}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {category.name}
                  </Link>
                </TD>
                <TD className="font-mono">{category.codePrefix}</TD>
                <TD>{UNIT_LABELS[category.defaultUnit]}</TD>
                <TD className="text-gray-600">
                  {category.attributes.length
                    ? category.attributes
                        .map((attribute) =>
                          attribute.type === "OPTION"
                            ? `${attribute.name} (${attribute.options.length})`
                            : attribute.name,
                        )
                        .join(", ")
                    : "None"}
                </TD>
                <TD className="text-right">{category._count.products}</TD>
                <TD>
                  {category.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                </TD>
              </TR>
            ))}
            {categories.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-gray-500">
                  No categories yet.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
