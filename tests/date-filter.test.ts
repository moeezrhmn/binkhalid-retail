import { describe, expect, it } from "vitest";
import { thisMonthRange } from "@/lib/dates";
import { decodePeriod, encodePeriod, rangeFromParams } from "@/lib/date-filter";

describe("period filter", () => {
  it("defaults to this month", () => {
    const { period, range } = rangeFromParams({});
    expect(period).toBe("month");
    expect(range).toEqual(thisMonthRange());
  });

  it("round-trips the saved choice through the cookie value", () => {
    expect(decodePeriod(encodePeriod({ period: "week" }))).toEqual({ period: "week" });
    expect(
      decodePeriod(encodePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-15" })),
    ).toEqual({ period: "custom", from: "2026-10-01", to: "2026-10-15" });
  });

  it("ignores a damaged or unknown cookie", () => {
    expect(decodePeriod(undefined)).toEqual({});
    expect(decodePeriod("year")).toEqual({});
    expect(decodePeriod("custom:bad:2026-10-15")).toEqual({
      period: "custom",
      from: undefined,
      to: "2026-10-15",
    });
    expect(rangeFromParams(decodePeriod("garbage")).period).toBe("month");
  });
});
