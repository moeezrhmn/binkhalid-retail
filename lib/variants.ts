import type { CodeAttribute } from "./codes";
import { validateQty, type UnitCode } from "./units";

export type AttributeDef = CodeAttribute & { options: string[] };

export type Selection = { name: string; values: string[] };

/** Every combination of the selected values: 4 sizes × 3 colors → 12 value sets. */
export function combinations(selections: Selection[]): Record<string, string>[] {
  const active = selections.filter((selection) => selection.values.length > 0);
  return active.reduce<Record<string, string>[]>(
    (sets, { name, values }) =>
      sets.flatMap((set) => values.map((value) => ({ ...set, [name]: value }))),
    [{}],
  );
}

/** Drops empty values so {Size: "M", Color: ""} and {Size: "M"} are the same variant. */
export function cleanValues(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([name, value]) => [name, value.trim()] as const)
      .filter(([, value]) => value !== ""),
  );
}

/** Stable identity of a variant's attribute values, independent of key order and case. */
export function variantKey(values: Record<string, string>): string {
  return Object.entries(cleanValues(values))
    .map(([name, value]) => `${name.toLowerCase()}=${value.toLowerCase()}`)
    .sort()
    .join("|");
}

/** "Black / M", in the category's attribute order. */
export function variantLabel(
  values: Record<string, string>,
  attributes: { name: string; sortOrder: number }[],
): string {
  const order = new Map(attributes.map((attribute) => [attribute.name, attribute.sortOrder]));
  return Object.entries(cleanValues(values))
    .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
    .map(([, value]) => value)
    .join(" / ");
}

export type VariantCheck = {
  values: Record<string, string>;
  openingStock: string;
  minStock: string;
};

/**
 * Checks a set of variants against the category's attributes and the unit.
 * Returns one message per problem (with the row number), empty when all is fine.
 */
export function checkVariants(
  variants: VariantCheck[],
  attributes: AttributeDef[],
  unit: UnitCode,
  existingKeys: Iterable<string> = [],
): string[] {
  const problems: string[] = [];
  const byName = new Map(attributes.map((attribute) => [attribute.name, attribute]));
  const seen = new Set(existingKeys);

  variants.forEach((variant, index) => {
    const row = variants.length > 1 ? `Row ${index + 1}: ` : "";
    const values = cleanValues(variant.values);

    for (const [name, value] of Object.entries(values)) {
      const attribute = byName.get(name);
      if (!attribute) {
        problems.push(`${row}"${name}" is not an attribute of this category`);
      } else if (attribute.type === "OPTION" && !attribute.options.includes(value)) {
        problems.push(`${row}"${value}" is not an option of ${name}`);
      }
    }

    const key = variantKey(values);
    if (seen.has(key)) {
      const label = Object.values(values).join(" / ") || "the single variant";
      problems.push(`${row}${label} already exists`);
    }
    seen.add(key);

    const stockError = validateQty(unit, variant.openingStock, { allowZero: true });
    if (stockError) problems.push(`${row}Opening stock: ${stockError}`);
    const minError = validateQty(unit, variant.minStock, { allowZero: true });
    if (minError) problems.push(`${row}Min stock: ${minError}`);
  });

  return problems;
}

/**
 * Orders variants the way the category lists its options (Black before White,
 * S → M → L → XL), rather than alphabetically by code.
 */
export function compareByOptions(
  attributes: { name: string; sortOrder: number; options: string[] }[],
): (a: Record<string, string>, b: Record<string, string>) => number {
  const ordered = [...attributes].sort((x, y) => x.sortOrder - y.sortOrder);
  const rank = (attribute: (typeof ordered)[number], value: string | undefined) => {
    if (value === undefined) return -1;
    const index = attribute.options.indexOf(value);
    return index === -1 ? attribute.options.length : index;
  };
  return (a, b) => {
    for (const attribute of ordered) {
      const diff = rank(attribute, a[attribute.name]) - rank(attribute, b[attribute.name]);
      if (diff !== 0) return diff;
    }
    return 0;
  };
}
