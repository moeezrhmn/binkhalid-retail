import { describe, expect, it } from "vitest";
import {
  customRange,
  shopDate,
  startOfShopDay,
  thisMonthRange,
  thisWeekRange,
  todayRange,
} from "@/lib/dates";

// Pakistan is UTC+5, so a Pakistan day starts at 19:00 UTC the previous day.

describe("shopDate", () => {
  it("uses the Pakistan calendar date, not UTC", () => {
    // 20:30 UTC on 22 Oct is 01:30 on 23 Oct in Pakistan
    expect(shopDate(new Date("2026-10-22T20:30:00Z"))).toEqual({ year: 2026, month: 10, day: 23 });
    expect(shopDate(new Date("2026-10-22T18:59:59Z"))).toEqual({ year: 2026, month: 10, day: 22 });
  });
});

describe("startOfShopDay", () => {
  it("returns midnight Pakistan time as a UTC instant", () => {
    expect(startOfShopDay({ year: 2026, month: 10, day: 23 }).toISOString()).toBe(
      "2026-10-22T19:00:00.000Z",
    );
  });
});

describe("todayRange", () => {
  it("covers the Pakistan day, even just after midnight", () => {
    const range = todayRange(new Date("2026-10-22T19:30:00Z")); // 00:30 on 23 Oct PKT
    expect(range.from.toISOString()).toBe("2026-10-22T19:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-23T19:00:00.000Z");
  });
});

describe("thisWeekRange", () => {
  it("starts on Monday", () => {
    // Thursday 22 Oct 2026, 12:00 PKT
    const range = thisWeekRange(new Date("2026-10-22T07:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-10-18T19:00:00.000Z"); // Mon 19 Oct 00:00 PKT
    expect(range.to.toISOString()).toBe("2026-10-22T19:00:00.000Z");
  });

  it("on a Monday, starts that same day", () => {
    const range = thisWeekRange(new Date("2026-10-19T05:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-10-18T19:00:00.000Z");
  });
});

describe("thisMonthRange", () => {
  it("starts on the 1st in Pakistan time", () => {
    const range = thisMonthRange(new Date("2026-10-22T07:00:00Z"));
    expect(range.from.toISOString()).toBe("2026-09-30T19:00:00.000Z");
  });

  it("handles the first hours of a new month", () => {
    // 00:30 on 1 Nov PKT = 19:30 UTC on 31 Oct
    const range = thisMonthRange(new Date("2026-10-31T19:30:00Z"));
    expect(range.from.toISOString()).toBe("2026-10-31T19:00:00.000Z");
  });
});

describe("customRange", () => {
  it("includes both days in full", () => {
    const range = customRange("2026-10-01", "2026-10-31");
    expect(range.from.toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-31T19:00:00.000Z");
  });

  it("rejects reversed or invalid dates", () => {
    expect(() => customRange("2026-10-05", "2026-10-01")).toThrow();
    expect(() => customRange("2026-02-30", "2026-03-01")).toThrow();
    expect(() => customRange("22-10-2026", "2026-10-30")).toThrow();
  });
});
