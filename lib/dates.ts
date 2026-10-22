// The shop runs on Pakistan time. Timestamps are stored in UTC; every
// "today / this week / this month" boundary is calculated in Asia/Karachi here.

export const SHOP_TIME_ZONE = "Asia/Karachi";

export type DateRange = { from: Date; to: Date }; // `to` is exclusive

type Ymd = { year: number; month: number; day: number };

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hourCycle: "h23",
});

function shopParts(instant: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  );
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** Offset of shop time from UTC at the given instant, in milliseconds. */
function shopOffsetMs(instant: Date): number {
  const p = shopParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The calendar date in Pakistan for an instant. */
export function shopDate(instant: Date): Ymd {
  const p = shopParts(instant);
  return { year: p.year, month: p.month, day: p.day };
}

/** The UTC instant at which a Pakistan calendar day starts. */
export function startOfShopDay({ year, month, day }: Ymd): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const first = new Date(guess.getTime() - shopOffsetMs(guess));
  return new Date(guess.getTime() - shopOffsetMs(first));
}

function addDays({ year, month, day }: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function todayRange(now = new Date()): DateRange {
  const today = shopDate(now);
  return { from: startOfShopDay(today), to: startOfShopDay(addDays(today, 1)) };
}

/** Week starts on Monday. */
export function thisWeekRange(now = new Date()): DateRange {
  const today = shopDate(now);
  const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
  const monday = addDays(today, -((weekday + 6) % 7));
  return { from: startOfShopDay(monday), to: startOfShopDay(addDays(today, 1)) };
}

export function thisMonthRange(now = new Date()): DateRange {
  const today = shopDate(now);
  return {
    from: startOfShopDay({ ...today, day: 1 }),
    to: startOfShopDay(addDays(today, 1)),
  };
}

/** Parses "YYYY-MM-DD" as a Pakistan calendar date. */
export function parseYmd(value: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date: "${value}"`);
  const ymd = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const check = addDays(ymd, 0);
  if (check.year !== ymd.year || check.month !== ymd.month || check.day !== ymd.day) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return ymd;
}

/** Inclusive custom range: both "from" and "to" days are included in full. */
export function customRange(fromYmd: string, toYmd: string): DateRange {
  const from = parseYmd(fromYmd);
  const to = parseYmd(toYmd);
  const range = { from: startOfShopDay(from), to: startOfShopDay(addDays(to, 1)) };
  if (range.from >= range.to) throw new Error("The start date must be on or before the end date");
  return range;
}

export function toYmd({ year, month, day }: Ymd): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
