import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatCell, type ReportTable } from "@/server/services/reports";

const NUMERIC = new Set(["rs", "qty", "int", "pct"]);

/** Renders any report the same way on screen and in print. */
export function ReportTableView({ report }: { report: ReportTable }) {
  return (
    <div>
      <Table>
        <THead>
          <tr>
            {report.columns.map((column) => (
              <TH key={column.key} className={cn(NUMERIC.has(column.format) && "text-right")}>
                {column.label}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {report.rows.map((row, index) => (
            <TR key={index}>
              {report.columns.map((column) => {
                const value = row[column.key];
                return (
                  <TD
                    key={column.key}
                    className={cn(
                      NUMERIC.has(column.format) && "text-right whitespace-nowrap tabular-nums",
                      column.format === "datetime" && "text-xs whitespace-nowrap",
                      typeof value === "number" &&
                        value < 0 &&
                        column.format === "rs" &&
                        "text-red-600",
                    )}
                  >
                    {formatCell(value, column.format)}
                  </TD>
                );
              })}
            </TR>
          ))}
          {report.rows.length === 0 ? (
            <tr>
              <TD colSpan={report.columns.length} className="py-10 text-center text-gray-500">
                Nothing to show for this period.
              </TD>
            </tr>
          ) : null}
        </TBody>
        {report.totals && report.rows.length > 0 ? (
          <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
            <tr>
              {report.columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-2",
                    NUMERIC.has(column.format) && "text-right whitespace-nowrap tabular-nums",
                  )}
                >
                  {formatCell(report.totals![column.key] ?? null, column.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </Table>
      {report.note ? <p className="px-3 py-2 text-xs text-gray-500">{report.note}</p> : null}
    </div>
  );
}
