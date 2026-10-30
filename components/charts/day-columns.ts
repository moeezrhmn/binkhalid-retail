import type { ColumnDatum } from "./column-chart";

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

/** Turns "YYYY-MM-DD" values into chart columns ("Tue 20", tooltip "Tuesday 20 Oct"). */
export function dayColumns(days: { day: string; value: number }[]): ColumnDatum[] {
  return days.map(({ day, value }) => {
    const date = new Date(`${day}T00:00:00Z`);
    return { key: day, label: dayLabel.format(date), detail: dayDetail.format(date), value };
  });
}
