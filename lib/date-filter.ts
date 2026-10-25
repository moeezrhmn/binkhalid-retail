import { customRange, thisMonthRange, thisWeekRange, todayRange, type DateRange } from "./dates";

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

/** Reads ?period=today|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD into a Pakistan-time range. */
export function rangeFromParams(params: { period?: string; from?: string; to?: string }): {
  period: Period;
  range: DateRange;
  from?: string;
  to?: string;
} {
  const period = (PERIODS.find((p) => p.value === params.period)?.value ?? "today") as Period;
  if (period === "custom" && (params.from || params.to)) {
    try {
      const from = params.from || params.to!;
      const to = params.to || params.from!;
      return { period, range: customRange(from, to), from, to };
    } catch {
      // fall through to today
    }
  }
  if (period === "week") return { period, range: thisWeekRange() };
  if (period === "month") return { period, range: thisMonthRange() };
  return { period: period === "custom" ? "custom" : "today", range: todayRange() };
}
