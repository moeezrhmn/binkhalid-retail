import type { Metadata } from "next";
import Link from "next/link";
import type { StockMovementType } from "@/generated/prisma/client";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { customRange, parseYmd } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDateTime, formatQty, formatRs } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { listMovements } from "@/server/services/stock";

export const metadata: Metadata = { title: "Stock movements" };

const TYPES: {
  value: StockMovementType;
  label: string;
  tone: "green" | "blue" | "gold" | "gray";
}[] = [
  { value: "STOCK_IN", label: "Stock in", tone: "green" },
  { value: "SALE", label: "Sale", tone: "blue" },
  { value: "RETURN", label: "Return", tone: "gold" },
  { value: "ADJUSTMENT", label: "Adjustment", tone: "gray" },
];

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

function validDate(value: string | undefined) {
  if (!value) return undefined;
  try {
    parseYmd(value);
    return value;
  } catch {
    return undefined;
  }
}

export default async function MovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  const params = await searchParams;
  const type = TYPES.find((t) => t.value === one(params.type))?.value;
  const from = validDate(one(params.from));
  const to = validDate(one(params.to));
  const page = Number(one(params.page)) || 1;
  const variantParam = one(params.variant);
  const codeParam = one(params.code)?.trim().toUpperCase();

  const variant =
    variantParam && /^[0-9a-f-]{36}$/.test(variantParam)
      ? await db.variant.findUnique({
          where: { id: variantParam },
          select: { id: true, code: true },
        })
      : codeParam
        ? await db.variant.findUnique({
            where: { code: codeParam },
            select: { id: true, code: true },
          })
        : null;

  let range;
  try {
    range = from || to ? customRange(from ?? to!, to ?? from!) : undefined;
  } catch {
    range = undefined;
  }

  const result = await listMovements({ variantId: variant?.id, type, range, page });
  const query = {
    type,
    from,
    to,
    variant: variant?.id,
  };

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <form action="/inventory/movements" className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span className="block">Item code</span>
            <Input
              name="code"
              defaultValue={variant?.code ?? codeParam ?? ""}
              placeholder="Scan or type"
              className="w-48"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span className="block">Type</span>
            <Select name="type" defaultValue={type ?? ""} className="w-36">
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span className="block">From</span>
            <Input type="date" name="from" defaultValue={from ?? ""} className="w-40" />
          </label>
          <label className="space-y-1 text-xs font-medium text-gray-600">
            <span className="block">To</span>
            <Input type="date" name="to" defaultValue={to ?? ""} className="w-40" />
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          <Link href="/inventory/movements" className={buttonClasses({ variant: "ghost" })}>
            Clear
          </Link>
        </form>
        {codeParam && !variant ? (
          <p className="mt-2 text-sm text-red-600">No item has the code {codeParam}.</p>
        ) : null}
      </Card>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>When</TH>
              <TH>Code</TH>
              <TH>Product</TH>
              <TH>Type</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Cost each</TH>
              <TH>Details</TH>
            </tr>
          </THead>
          <TBody>
            {result.items.map((m) => {
              const t = TYPES.find((x) => x.value === m.type)!;
              const positive = Number(m.qty) > 0;
              return (
                <TR key={m.id}>
                  <TD className="text-xs whitespace-nowrap text-gray-600">
                    {formatDateTime(m.createdAt)}
                  </TD>
                  <TD className="font-mono text-xs whitespace-nowrap">{m.code}</TD>
                  <TD>{m.productName}</TD>
                  <TD>
                    <Badge tone={t.tone}>{t.label}</Badge>
                  </TD>
                  <TD
                    className={cn(
                      "text-right font-semibold whitespace-nowrap",
                      positive ? "text-brand-700" : "text-red-600",
                    )}
                  >
                    {positive ? "+" : ""}
                    {formatQty(m.qty)}{" "}
                    <span className="font-normal text-gray-400">
                      {UNIT_LABELS[m.unit].toLowerCase()}
                    </span>
                  </TD>
                  <TD className="text-right text-gray-600">
                    {m.unitCost !== null ? formatRs(m.unitCost) : "—"}
                  </TD>
                  <TD className="text-sm text-gray-600">
                    {[
                      m.reason,
                      m.supplierName ? `Supplier: ${m.supplierName}` : null,
                      m.sale?.billNo ? `Bill #${m.sale.billNo}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </TD>
                </TR>
              );
            })}
            {result.items.length === 0 ? (
              <tr>
                <TD colSpan={7} className="py-10 text-center text-gray-500">
                  No stock movements match.
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
