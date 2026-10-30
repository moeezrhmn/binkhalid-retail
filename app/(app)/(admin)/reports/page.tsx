import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PeriodFilter } from "@/components/period-filter";
import { PrintButton } from "@/components/print-button";
import { ReportVisualView } from "@/components/reports/report-visual";
import { ReportTableView } from "@/components/reports/report-table";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { resolvePeriod } from "@/lib/period";
import { rangeLabel } from "@/lib/date-filter";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth";
import {
  buildReport,
  CASH_FLOW_FILTERS,
  REPORTS,
  UNDATED,
  type ReportKey,
} from "@/server/services/reports";

export const metadata: Metadata = { title: "Reports" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  await requireAdmin();
  const params = await searchParams;
  const key = (REPORTS.find((r) => r.key === one(params.report))?.key ??
    "sales-by-product") as ReportKey;
  const { period, range, from, to } = await resolvePeriod({
    period: one(params.period),
    from: one(params.from),
    to: one(params.to),
  });
  const filters = { type: one(params.type), method: one(params.method) };
  const [report, settings] = await Promise.all([buildReport(key, range, filters), getSettings()]);
  const undated = UNDATED.has(key);

  const query = new URLSearchParams();
  query.set("report", key);
  query.set("period", period);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  if (key === "cash-flow" && filters.type) query.set("type", filters.type);
  if (key === "cash-flow" && filters.method) query.set("method", filters.method);
  const keep = (reportKey: string) => {
    const next = new URLSearchParams(query);
    next.set("report", reportKey);
    next.delete("type");
    next.delete("method");
    return `/reports?${next.toString()}`;
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description="Pick a report and a period. Export to Excel or print / save as PDF."
          actions={
            <>
              <a
                href={`/reports/export?${query.toString()}`}
                data-no-progress
                className={buttonClasses({ variant: "secondary" })}
              >
                <FileSpreadsheet className="size-4" aria-hidden /> Excel
              </a>
              <PrintButton />
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[13rem_minmax(0,1fr)] print:block">
        <nav aria-label="Reports" className="print:hidden">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {REPORTS.map((r) => (
              <li key={r.key}>
                <Link
                  href={keep(r.key)}
                  aria-current={r.key === key ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap",
                    // Selected report: the raised look of the primary button.
                    r.key === key
                      ? "bg-brand-700 bg-linear-to-b from-white/10 to-transparent font-semibold text-white shadow-btn-primary"
                      : "text-gray-700 hover:bg-black/5",
                  )}
                >
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {undated ? (
              <p className="text-sm text-gray-500">Shows stock as it is right now.</p>
            ) : (
              <PeriodFilter
                basePath="/reports"
                period={period}
                from={from}
                to={to}
                extra={{ report: key }}
              />
            )}
            {key === "cash-flow" ? (
              <form action="/reports" className="flex items-center gap-1.5">
                <input type="hidden" name="report" value={key} />
                {period !== "today" ? <input type="hidden" name="period" value={period} /> : null}
                {from ? <input type="hidden" name="from" value={from} /> : null}
                {to ? <input type="hidden" name="to" value={to} /> : null}
                <Select
                  name="type"
                  defaultValue={filters.type ?? ""}
                  aria-label="Type"
                  className="h-8 w-40"
                >
                  <option value="">All types</option>
                  {CASH_FLOW_FILTERS.types.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
                <Select
                  name="method"
                  defaultValue={filters.method ?? ""}
                  aria-label="Method"
                  className="h-8 w-36"
                >
                  <option value="">All methods</option>
                  {CASH_FLOW_FILTERS.methods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" size="sm">
                  Filter
                </Button>
              </form>
            ) : null}
          </div>

          <div>
            <p className="hidden text-xs text-gray-500 print:block">{settings.shopName}</p>
            <h2 className="text-base font-semibold text-gray-900">{report.title}</h2>
            <p className="text-xs text-gray-500">
              {undated ? "As of now" : rangeLabel(range)} · {report.description}
            </p>
          </div>
          {report.visual ? <ReportVisualView visual={report.visual} /> : null}
          <Card>
            <ReportTableView report={report} />
          </Card>
        </div>
      </div>
    </>
  );
}
