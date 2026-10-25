import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/auth";
import { rangeFromParams, rangeLabel } from "@/lib/date-filter";
import { shopDate, toYmd } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import {
  buildReport,
  REPORTS,
  UNDATED,
  type ColumnFormat,
  type ReportKey,
} from "@/server/services/reports";

const NUMBER_FORMATS: Partial<Record<ColumnFormat, string>> = {
  rs: '"Rs" #,##0;[Red]-"Rs" #,##0',
  qty: "0.###",
  int: "0",
  pct: '0.0"%"',
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.type !== "ADMIN") return new Response("Unauthorized", { status: 401 });

  const params = new URL(request.url).searchParams;
  const meta = REPORTS.find((r) => r.key === params.get("report"));
  if (!meta) return new Response("Unknown report", { status: 400 });
  const key = meta.key as ReportKey;
  const { range } = rangeFromParams({
    period: params.get("period") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  const [report, settings] = await Promise.all([
    buildReport(key, range, {
      type: params.get("type") ?? undefined,
      method: params.get("method") ?? undefined,
    }),
    getSettings(),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = settings.shopName;
  const sheet = workbook.addWorksheet(report.title.slice(0, 31));
  const period = UNDATED.has(key) ? `As of ${formatDateTime(new Date())}` : rangeLabel(range);

  sheet.addRow([`${settings.shopName}: ${report.title}`]).font = { bold: true, size: 14 };
  sheet.addRow([period]);
  sheet.addRow([report.description]).font = { italic: true, color: { argb: "FF6B7280" } };
  sheet.addRow([]);
  const header = sheet.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF6F2" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF17573F" } } };
  });

  const cellValue = (value: unknown, format: ColumnFormat) =>
    value instanceof Date ? (format === "datetime" ? formatDateTime(value) : value) : (value ?? "");

  for (const row of report.rows) {
    sheet.addRow(report.columns.map((c) => cellValue(row[c.key], c.format)));
  }
  if (report.totals && report.rows.length) {
    const totals = sheet.addRow(
      report.columns.map((c) => cellValue(report.totals![c.key], c.format)),
    );
    totals.font = { bold: true };
    totals.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
  }
  if (report.note) sheet.addRow([]).getCell(1).value = report.note;

  report.columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    const numberFormat = NUMBER_FORMATS[column.format];
    if (numberFormat) col.numFmt = numberFormat;
    col.width = Math.min(
      45,
      Math.max(
        column.label.length + 2,
        ...report.rows
          .slice(0, 200)
          .map((r) => String(cellValue(r[column.key], column.format)).length + 2),
        10,
      ),
    );
  });
  sheet.views = [{ state: "frozen", ySplit: 5 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = toYmd(shopDate(new Date()));
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${key}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
