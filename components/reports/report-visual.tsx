import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { dayColumns } from "@/components/charts/day-columns";
import { StatTile } from "@/components/stat-tile";
import { Card } from "@/components/ui/card";
import { formatCell, type ReportVisual } from "@/server/services/reports";

/** Headline numbers and one chart above a report's table. */
export function ReportVisualView({ visual }: { visual: ReportVisual }) {
  const { tiles, chart } = visual;
  const empty =
    chart &&
    (chart.kind === "bars" ? chart.bars.length === 0 : chart.days.every((d) => d.value === 0));

  return (
    <>
      {tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile
              key={tile.label}
              label={tile.label}
              value={formatCell(tile.value, tile.format) || "0"}
              hint={tile.hint}
              negative={tile.format === "rs" && tile.value < 0}
            />
          ))}
        </div>
      ) : null}
      {chart ? (
        <Card className="p-4 print:break-inside-avoid print:shadow-none">
          <h2 className="text-sm font-semibold text-gray-900">{chart.title}</h2>
          {chart.note ? <p className="text-xs text-gray-500">{chart.note}</p> : null}
          <div className="mt-3">
            {empty ? (
              <p className="py-8 text-center text-sm text-gray-500">
                Nothing to show for this period.
              </p>
            ) : chart.kind === "bars" ? (
              <BarList label={chart.title} data={chart.bars} />
            ) : (
              <ColumnChart label={chart.title} data={dayColumns(chart.days)} />
            )}
          </div>
        </Card>
      ) : null}
    </>
  );
}
