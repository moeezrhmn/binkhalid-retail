import { describe, expect, it } from "vitest";
import {
  discountAmount,
  lineAmount,
  percentOf,
  qtyToMilli,
  roundDiv,
  splitBillDiscount,
} from "@/lib/money";

describe("roundDiv", () => {
  it("rounds half away from zero", () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(7, 3)).toBe(2);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(Object.is(roundDiv(-1, 3), 0)).toBe(true);
  });
});

describe("qtyToMilli", () => {
  it("parses quantities without float error", () => {
    expect(qtyToMilli(1)).toBe(1000);
    expect(qtyToMilli("2.5")).toBe(2500);
    expect(qtyToMilli("2.675")).toBe(2675);
    expect(qtyToMilli("3.000")).toBe(3000);
    expect(qtyToMilli("-1.5")).toBe(-1500);
    expect(qtyToMilli({ toString: () => "12.125" })).toBe(12125);
  });

  it("rejects more than 3 decimals and junk", () => {
    expect(() => qtyToMilli("1.2345")).toThrow();
    expect(() => qtyToMilli("abc")).toThrow();
    expect(() => qtyToMilli("")).toThrow();
  });
});

describe("lineAmount", () => {
  it("multiplies and rounds to the nearest rupee", () => {
    expect(lineAmount(1500, 2)).toBe(3000);
    expect(lineAmount(333, "2.5")).toBe(833); // 832.5 → 833
    expect(lineAmount(450, "1.333")).toBe(600); // 599.85 → 600
    expect(lineAmount(0, 5)).toBe(0);
  });

  it("rejects non-integer prices", () => {
    expect(() => lineAmount(10.5, 1)).toThrow();
    expect(() => lineAmount(-1, 1)).toThrow();
  });
});

describe("percentOf / discountAmount", () => {
  it("calculates percentages in whole rupees", () => {
    expect(percentOf(1999, 10)).toBe(200); // 199.9
    expect(percentOf(1500, 15)).toBe(225);
    expect(() => percentOf(100, 101)).toThrow();
  });

  it("never discounts more than the amount", () => {
    expect(discountAmount(500, "AMOUNT", 100)).toBe(100);
    expect(discountAmount(500, "AMOUNT", 900)).toBe(500);
    expect(discountAmount(500, "PERCENT", 100)).toBe(500);
    expect(discountAmount(1250, "PERCENT", 10)).toBe(125);
  });
});

describe("splitBillDiscount", () => {
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

  it("splits proportionally and adds up exactly", () => {
    const shares = splitBillDiscount([1000, 500, 500], 200);
    expect(shares).toEqual([100, 50, 50]);
  });

  it("puts leftover rupees on the largest remainders", () => {
    const shares = splitBillDiscount([100, 100, 100], 100);
    expect(sum(shares)).toBe(100);
    expect(shares.every((share) => share === 33 || share === 34)).toBe(true);
  });

  it("never gives a line more than its own total", () => {
    const lines = [1, 1, 1];
    const shares = splitBillDiscount(lines, 2);
    expect(sum(shares)).toBe(2);
    shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(lines[i]));
  });

  it("handles a full discount and zero discount", () => {
    expect(splitBillDiscount([700, 300], 1000)).toEqual([700, 300]);
    expect(splitBillDiscount([700, 300], 0)).toEqual([0, 0]);
  });

  it("rejects a discount larger than the subtotal", () => {
    expect(() => splitBillDiscount([100], 101)).toThrow();
  });

  it("always adds up for awkward numbers", () => {
    const lines = [1333, 777, 2, 9999, 45];
    for (const discount of [1, 7, 99, 500, 1234, 12156]) {
      const shares = splitBillDiscount(lines, discount);
      expect(sum(shares)).toBe(discount);
      shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(lines[i]));
    }
  });
});
