import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { PeriodFilter } from "@/components/period-filter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { METHOD_LABELS } from "@/lib/cart";
import { resolvePeriod } from "@/lib/period";
import { periodQuery } from "@/lib/date-filter";
import { formatDateTime, formatRs } from "@/lib/format";
import { listSales } from "@/server/services/sales-history";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Sales" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function SalesPage({ searchParams }: PageProps<"/sales">) {
  await requireAdmin();
  const params = await searchParams;
  const q = one(params.q)?.trim() ?? "";
  const { period, range, from, to } = await resolvePeriod({
    period: one(params.period),
    from: one(params.from),
    to: one(params.to),
  });
  const page = Number(one(params.page)) || 1;
  const result = await listSales({ range, q, page });
  const query = { q: q || undefined, ...periodQuery(period, from, to) };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodFilter
          basePath="/sales"
          period={period}
          from={from}
          to={to}
          extra={{ q: q || undefined }}
        />
        <form action="/sales" className="relative w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Bill number, customer or phone"
            aria-label="Search bills"
            className="pl-8"
          />
          <input type="hidden" name="period" value={period} />
          {from ? <input type="hidden" name="from" value={from} /> : null}
          {to ? <input type="hidden" name="to" value={to} /> : null}
        </form>
      </div>

      <p className="text-sm text-gray-600">
        {result.total} bill{result.total === 1 ? "" : "s"} ·{" "}
        <strong>{formatRs(result.totalAmount)}</strong>
        {/^#?\d+$/.test(q) ? " (bill number search ignores the dates)" : ""}
      </p>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Bill</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Salesperson</TH>
              <TH className="text-right">Items</TH>
              <TH>Paid by</TH>
              <TH className="text-right">Total</TH>
            </tr>
          </THead>
          <TBody>
            {result.items.map((sale) => (
              <TR key={sale.id}>
                <TD>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    #{sale.billNo}
                  </Link>
                  {sale.returned ? (
                    <span className="ml-2">
                      <Badge tone="gold">Returns</Badge>
                    </span>
                  ) : null}
                </TD>
                <TD className="text-xs whitespace-nowrap text-gray-600">
                  {formatDateTime(sale.completedAt)}
                </TD>
                <TD>{sale.customerName}</TD>
                <TD className="text-gray-600">{sale.userName}</TD>
                <TD className="text-right">{sale.itemCount}</TD>
                <TD className="text-gray-600">
                  {sale.methods.map((m) => METHOD_LABELS[m]).join(", ")}
                </TD>
                <TD className="text-right font-semibold">{formatRs(sale.total)}</TD>
              </TR>
            ))}
            {result.items.length === 0 ? (
              <tr>
                <TD colSpan={7} className="py-10 text-center text-gray-500">
                  No bills found.
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
