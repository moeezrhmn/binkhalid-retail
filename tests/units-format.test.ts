import { describe, expect, it } from "vitest";
import { formatQty, formatRs, normalizePhone } from "@/lib/format";
import { validateQty } from "@/lib/units";

describe("validateQty", () => {
  it("allows only whole numbers for pieces and bottles", () => {
    expect(validateQty("PIECE", 2)).toBeNull();
    expect(validateQty("PIECE", "1.5")).toMatch(/whole/);
    expect(validateQty("BOTTLE", "2.000")).toBeNull();
  });

  it("allows decimals for meters, ml and grams", () => {
    expect(validateQty("METER", "2.5")).toBeNull();
    expect(validateQty("GRAM", "0.125")).toBeNull();
  });

  it("rejects zero, negatives and junk", () => {
    expect(validateQty("METER", 0)).not.toBeNull();
    expect(validateQty("METER", "-1")).not.toBeNull();
    expect(validateQty("METER", "abc")).not.toBeNull();
  });
});

describe("formatRs / formatQty", () => {
  it("formats rupees", () => {
    expect(formatRs(1500)).toBe("Rs 1,500");
    expect(formatRs(0)).toBe("Rs 0");
    expect(formatRs(-200)).toBe("-Rs 200");
    expect(formatRs(1250000)).toBe("Rs 1,250,000");
  });

  it("trims trailing zeros from quantities", () => {
    expect(formatQty("2.500")).toBe("2.5");
    expect(formatQty("3.000")).toBe("3");
    expect(formatQty("10")).toBe("10");
  });
});

describe("normalizePhone", () => {
  it("brings Pakistani numbers to one form", () => {
    expect(normalizePhone("0300-1234567")).toBe("03001234567");
    expect(normalizePhone("+92 300 1234567")).toBe("03001234567");
    expect(normalizePhone("3001234567")).toBe("03001234567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("  ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("validateQty with allowZero", () => {
  it("accepts 0 for stock levels but still rejects negatives", () => {
    expect(validateQty("PIECE", 0, { allowZero: true })).toBeNull();
    expect(validateQty("PIECE", "-1", { allowZero: true })).toMatch(/negative/);
    expect(validateQty("PIECE", "0.5", { allowZero: true })).toMatch(/whole/);
  });
});
