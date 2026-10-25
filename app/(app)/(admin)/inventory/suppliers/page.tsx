import type { Metadata } from "next";
import { SupplierButton } from "@/components/inventory/supplier-form";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const suppliers = await db.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { movements: true } } },
  });
  const lastDelivery = await db.stockMovement.groupBy({
    by: ["supplierId"],
    where: { supplierId: { not: null } },
    _max: { createdAt: true },
  });
  const last = new Map(lastDelivery.map((row) => [row.supplierId, row._max.createdAt]));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <SupplierButton />
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Supplier</TH>
              <TH>Phone</TH>
              <TH>Notes</TH>
              <TH className="text-right">Items received</TH>
              <TH>Last delivery</TH>
              <TH className="text-right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {suppliers.map((supplier) => (
              <TR key={supplier.id}>
                <TD className="font-medium">{supplier.name}</TD>
                <TD className="text-gray-600">{supplier.phone ?? "—"}</TD>
                <TD className="text-gray-600">{supplier.notes ?? "—"}</TD>
                <TD className="text-right">{supplier._count.movements}</TD>
                <TD className="text-gray-600">
                  {last.get(supplier.id) ? formatDate(last.get(supplier.id)!) : "—"}
                </TD>
                <TD className="text-right">
                  <SupplierButton
                    supplier={{
                      id: supplier.id,
                      name: supplier.name,
                      phone: supplier.phone,
                      notes: supplier.notes,
                    }}
                  />
                </TD>
              </TR>
            ))}
            {suppliers.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-gray-500">
                  No suppliers yet. You can also add one while receiving stock.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
