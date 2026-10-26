import type { Metadata } from "next";
import Link from "next/link";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { rangeFromParams } from "@/lib/date-filter";
import { formatRs } from "@/lib/format";
import { buildReport, salesByDay, salesTotals } from "@/server/services/reports";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
const DAY = 24 * 60 * 60 * 1000;

const dayLabel = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  timeZone: "UTC",
});
const dayDetail = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-gray-400">{hint}</p> : null}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  await requireAdmin();
  const params = await searchParams;
  const { period, range, from, to } = rangeFromParams({
    period: one(params.period),
    from: one(params.from),
    to: one(params.to),
  });
  // The daily chart covers the chosen period, and at least the last 7 days.
  const chartRange =
    range.to.getTime() - range.from.getTime() < 7 * DAY
      ? { from: new Date(range.to.getTime() - 7 * DAY), to: range.to }
      : range;

  const [totals, days, categories, top, low] = await Promise.all([
    salesTotals(range),
    salesByDay(chartRange),
    buildReport("sales-by-category", range),
    buildReport("top-selling", range),
    buildReport("low-stock", range),
  ]);
  const periodName = {
    today: "today",
    week: "this week",
    month: "this month",
    custom: "in this period",
  }[period];

  return (
    <>
      <PageHeader title="Dashboard" description="Sales, profit and stock at a glance." />
      <div className="space-y-3">
        <PeriodFilter basePath="/dashboard" period={period} from={from} to={to} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Net sales"
            value={formatRs(totals.netSales)}
            hint={`After returns, ${periodName}`}
          />
          <StatTile label="Bills" value={totals.bills.toLocaleString("en-US")} hint={periodName} />
          <StatTile label="Profit" value={formatRs(totals.profit)} hint="Net sales minus cost" />
          <StatTile
            label="Udhaar outstanding"
            value={formatRs(totals.creditOutstanding)}
            hint="All customers, right now"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold text-gray-900">Daily net sales</h2>
            <p className="mb-2 text-xs text-gray-500">
              {days.length <= 7 ? "Last 7 days" : `${days.length} days`}, after returns
            </p>
            <ColumnChart
              label="Daily net sales"
              data={days.map((d) => {
                const date = new Date(`${d.day}T00:00:00Z`);
                return {
                  key: d.day,
                  label: dayLabel.format(date),
                  detail: dayDetail.format(date),
                  value: d.amount,
                };
              })}
            />
          </Card>
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-gray-900">Sales by category</h2>
            <p className="mb-3 text-xs text-gray-500">Net sales {periodName}</p>
            <BarList
              label="Sales by category"
              data={categories.rows.map((r) => ({
                key: String(r.category),
                label: String(r.category),
                value: Number(r.sales),
                share: Number(r.share),
              }))}
            />
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-sm font-semibold text-gray-900">Top-selling {periodName}</h2>
              <Link
                href={`/reports?report=top-selling${period !== "today" ? `&period=${period}` : ""}`}
                className="text-xs text-brand-700 hover:underline"
              >
                Full report
              </Link>
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH className="text-right">Qty</TH>
                  <TH className="text-right">Net sales</TH>
                </tr>
              </THead>
              <TBody>
                {top.rows.slice(0, 8).map((row) => (
                  <TR key={String(row.code)}>
                    <TD>
                      {String(row.item)}
                      <span className="ml-2 font-mono text-xs text-gray-400">
                        {String(row.code)}
                      </span>
                    </TD>
                    <TD className="text-right tabular-nums">{Number(row.qty)}</TD>
                    <TD className="text-right tabular-nums">{formatRs(Number(row.sales))}</TD>
                  </TR>
                ))}
                {top.rows.length === 0 ? (
                  <tr>
                    <TD colSpan={3} className="py-6 text-center text-gray-500">
                      No sales {periodName}.
                    </TD>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>
          <Card>
            <div className="flex items-center justify-between px-4 pt-3">
              <h2 className="text-sm font-semibold text-gray-900">Low-stock alerts</h2>
              <Link href="/inventory?stock=low" className="text-xs text-brand-700 hover:underline">
                See all in Inventory
              </Link>
            </div>
            <Table>
              <THead>
                <tr>
                  <TH>Item</TH>
                  <TH className="text-right">In stock</TH>
                  <TH className="text-right">Minimum</TH>
                </tr>
              </THead>
              <TBody>
                {low.rows.slice(0, 8).map((row) => (
                  <TR key={String(row.code)}>
                    <TD>
                      {String(row.item)}
                      <span className="ml-2 font-mono text-xs text-gray-400">
                        {String(row.code)}
                      </span>
                    </TD>
                    <TD className="text-right">
                      {Number(row.stock) <= 0 ? (
                        <Badge tone="red">Out</Badge>
                      ) : (
                        <span className="font-semibold text-gold-600 tabular-nums">
                          {Number(row.stock)}
                        </span>
                      )}
                    </TD>
                    <TD className="text-right text-gray-600 tabular-nums">{Number(row.min)}</TD>
                  </TR>
                ))}
                {low.rows.length === 0 ? (
                  <tr>
                    <TD colSpan={3} className="py-6 text-center text-gray-500">
                      Nothing is low on stock.
                    </TD>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
