import { describe, expect, it } from "vitest";
import {
  checkVariants,
  cleanValues,
  combinations,
  compareByOptions,
  variantKey,
  variantLabel,
  type AttributeDef,
} from "@/lib/variants";

const color: AttributeDef = {
  name: "Color",
  type: "OPTION",
  usedInCode: true,
  sortOrder: 0,
  options: ["Black", "White", "Grey"],
  codeAbbrevs: { Black: "BLK", White: "WHT", Grey: "GRY" },
};
const size: AttributeDef = {
  name: "Size",
  type: "OPTION",
  usedInCode: true,
  sortOrder: 1,
  options: ["S", "M", "L", "XL"],
  codeAbbrevs: { S: "S", M: "M", L: "L", XL: "XL" },
};

describe("combinations", () => {
  it("makes every combination (4 sizes × 3 colors = 12)", () => {
    const sets = combinations([
      { name: "Size", values: ["S", "M", "L", "XL"] },
      { name: "Color", values: ["Black", "White", "Grey"] },
    ]);
    expect(sets).toHaveLength(12);
    expect(new Set(sets.map(variantKey)).size).toBe(12);
  });

  it("ignores attributes with nothing selected", () => {
    expect(
      combinations([
        { name: "Size", values: ["M"] },
        { name: "Color", values: [] },
      ]),
    ).toEqual([{ Size: "M" }]);
  });

  it("gives one empty variant when nothing is selected (single-variant product)", () => {
    expect(combinations([])).toEqual([{}]);
  });
});

describe("variantKey / cleanValues / variantLabel", () => {
  it("ignores key order, case and empty values", () => {
    expect(variantKey({ Size: "M", Color: "Black" })).toBe(
      variantKey({ color: "black", size: "m" }),
    );
    expect(variantKey({ Size: "M", Color: "" })).toBe(variantKey({ Size: "M" }));
    expect(cleanValues({ Size: " M ", Color: " " })).toEqual({ Size: "M" });
  });

  it("labels values in attribute order", () => {
    expect(variantLabel({ Size: "M", Color: "Black" }, [color, size])).toBe("Black / M");
  });
});

describe("checkVariants", () => {
  const ok = { openingStock: "0", minStock: "0" };

  it("accepts a valid set", () => {
    const variants = [
      { values: { Color: "Black", Size: "M" }, ...ok },
      { values: { Color: "White", Size: "M" }, ...ok },
    ];
    expect(checkVariants(variants, [color, size], "PIECE")).toEqual([]);
  });

  it("rejects duplicates, unknown options and attributes", () => {
    const problems = checkVariants(
      [
        { values: { Color: "Black" }, ...ok },
        { values: { Color: "Black" }, ...ok },
        { values: { Color: "Pink" }, ...ok },
        { values: { Fabric: "Silk" }, ...ok },
      ],
      [color],
      "PIECE",
    );
    expect(problems).toEqual([
      "Row 2: Black already exists",
      'Row 3: "Pink" is not an option of Color',
      'Row 4: "Fabric" is not an attribute of this category',
    ]);
  });

  it("rejects variants that already exist on the product", () => {
    const existing = [variantKey({ Color: "Black" })];
    expect(
      checkVariants([{ values: { Color: "Black" }, ...ok }], [color], "PIECE", existing),
    ).toEqual(["Black already exists"]);
  });

  it("checks stock against the unit", () => {
    const problems = checkVariants(
      [{ values: {}, openingStock: "2.5", minStock: "-1" }],
      [],
      "PIECE",
    );
    expect(problems).toHaveLength(2);
    expect(
      checkVariants([{ values: {}, openingStock: "2.5", minStock: "1" }], [], "METER"),
    ).toEqual([]);
  });
});

describe("compareByOptions", () => {
  it("sorts by the category's option order, attribute by attribute", () => {
    const values: Record<string, string>[] = [
      { Color: "White", Size: "L" },
      { Color: "Black", Size: "XL" },
      { Color: "White", Size: "M" },
      { Color: "Black", Size: "M" },
      {},
    ];
    expect(
      values.sort(compareByOptions([size, color])).map((v) => variantLabel(v, [color, size])),
    ).toEqual(["", "Black / M", "Black / XL", "White / M", "White / L"]);
  });
});
