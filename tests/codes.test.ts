import { describe, expect, it } from "vitest";
import { buildVariantCode, normalizeCode, toCodeSegment, type CodeAttribute } from "@/lib/codes";

const size: CodeAttribute = {
  name: "Size",
  type: "OPTION",
  usedInCode: true,
  sortOrder: 2,
  codeAbbrevs: { Small: "S", Medium: "M", Large: "L" },
};
const color: CodeAttribute = {
  name: "Color",
  type: "OPTION",
  usedInCode: true,
  sortOrder: 1,
  codeAbbrevs: { Black: "BLK", White: "WHT" },
};

describe("buildVariantCode", () => {
  it("builds prefix, padded number and attribute codes in sort order", () => {
    expect(
      buildVariantCode({
        prefix: "CAP",
        productSeq: 12,
        attributes: [size, color],
        values: { Size: "Medium", Color: "Black" },
      }),
    ).toBe("CAP-0012-BLK-M");
  });

  it("works for a single-variant product with no attributes", () => {
    expect(buildVariantCode({ prefix: "atr", productSeq: 3, attributes: [], values: {} })).toBe(
      "ATR-0003",
    );
  });

  it("skips attributes not used in the code", () => {
    const code = buildVariantCode({
      prefix: "CAP",
      productSeq: 1,
      attributes: [size, { ...color, usedInCode: false }],
      values: { Size: "Large", Color: "White" },
    });
    expect(code).toBe("CAP-0001-L");
  });

  it("uses the cleaned value for TEXT attributes", () => {
    const volume: CodeAttribute = {
      name: "Volume",
      type: "TEXT",
      usedInCode: true,
      sortOrder: 1,
      codeAbbrevs: {},
    };
    const code = buildVariantCode({
      prefix: "ATR",
      productSeq: 31,
      attributes: [volume],
      values: { Volume: "6 ml" },
    });
    expect(code).toBe("ATR-0031-6ML");
  });

  it("fails loudly when an option has no abbreviation", () => {
    expect(() =>
      buildVariantCode({
        prefix: "CAP",
        productSeq: 1,
        attributes: [color],
        values: { Color: "Grey" },
      }),
    ).toThrow(/abbreviation/);
  });

  it("rejects an invalid prefix or product number", () => {
    expect(() =>
      buildVariantCode({ prefix: "C-P", productSeq: 1, attributes: [], values: {} }),
    ).toThrow();
    expect(() =>
      buildVariantCode({ prefix: "CAP", productSeq: 0, attributes: [], values: {} }),
    ).toThrow();
  });
});

describe("normalizeCode / toCodeSegment", () => {
  it("uppercases and trims scanned codes", () => {
    expect(normalizeCode("  cap-0012-blk-m ")).toBe("CAP-0012-BLK-M");
  });

  it("keeps only letters and digits", () => {
    expect(toCodeSegment("500 g")).toBe("500G");
    expect(toCodeSegment("Off-White")).toBe("OFFWHITE");
  });
});
