import { customRange, thisMonthRange, thisWeekRange, todayRange, type DateRange } from "./dates";

export const PERIODS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
] as const;
export type Period = (typeof PERIODS)[number]["value"];

export const DEFAULT_PERIOD: Period = "month";

/** Remembers the last chosen period, shared by Dashboard, Sales and Reports. */
export const PERIOD_COOKIE = "bk_period";

export type PeriodParams = { period?: string; from?: string; to?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "month", or "custom:2026-10-01:2026-10-15". */
export function encodePeriod({ period, from, to }: PeriodParams) {
  return period === "custom" ? `custom:${from ?? ""}:${to ?? ""}` : (period ?? DEFAULT_PERIOD);
}

export function decodePeriod(value: string | undefined): PeriodParams {
  if (!value) return {};
  const [period, from, to] = value.split(":");
  if (!PERIODS.some((p) => p.value === period)) return {};
  return {
    period,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
  };
}

/** The period as query parameters, always explicit so links keep it. */
export function periodQuery(period: Period, from?: string, to?: string) {
  return {
    period,
    from: period === "custom" ? from : undefined,
    to: period === "custom" ? to : undefined,
  };
}

/** Reads ?period=today|week|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD into a Pakistan-time range. */
export function rangeFromParams(params: PeriodParams): {
  period: Period;
  range: DateRange;
  from?: string;
  to?: string;
} {
  const period = (PERIODS.find((p) => p.value === params.period)?.value ??
    DEFAULT_PERIOD) as Period;
  if (period === "custom" && (params.from || params.to)) {
    try {
      const from = params.from || params.to!;
      const to = params.to || params.from!;
      return { period, range: customRange(from, to), from, to };
    } catch {
      // fall through to the default
    }
  }
  if (period === "today") return { period, range: todayRange() };
  if (period === "week") return { period, range: thisWeekRange() };
  return { period: "month", range: thisMonthRange() };
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Karachi",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "26 Oct 2026" or "1 Oct 2026 – 26 Oct 2026", in Pakistan time. */
export function rangeLabel(range: DateRange) {
  const first = dayFormat.format(range.from);
  const last = dayFormat.format(new Date(range.to.getTime() - 1));
  return first === last ? first : `${first} – ${last}`;
}
