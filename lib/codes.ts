// The only place that knows the product code format. Changing the format is a
// change to this file. Codes already saved are never regenerated.
//
// Current (default) format: {CATEGORY_PREFIX}-{PRODUCT_SEQ}-{ATTRIBUTE_ABBREVS}
//   CAP-0012-BLK-M

export type CodeAttribute = {
  name: string;
  type: "TEXT" | "OPTION";
  usedInCode: boolean;
  sortOrder: number;
  codeAbbrevs: Record<string, string>;
};

const SEGMENT = /^[A-Z0-9]{1,8}$/;

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Turns free text into a code segment: uppercase letters and digits only. */
export function toCodeSegment(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function isValidSegment(segment: string): boolean {
  return SEGMENT.test(segment);
}

export function formatProductSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid product number: ${seq}`);
  return String(seq).padStart(4, "0");
}

export function buildVariantCode(input: {
  prefix: string;
  productSeq: number;
  attributes: CodeAttribute[];
  values: Record<string, string>;
}): string {
  const prefix = normalizeCode(input.prefix);
  if (!isValidSegment(prefix)) throw new Error(`Invalid category prefix: "${input.prefix}"`);

  const segments = [prefix, formatProductSeq(input.productSeq)];

  const coded = input.attributes
    .filter((attribute) => attribute.usedInCode)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const attribute of coded) {
    const value = input.values[attribute.name]?.trim();
    if (!value) continue;

    const segment =
      attribute.type === "OPTION"
        ? normalizeCode(attribute.codeAbbrevs[value] ?? "")
        : toCodeSegment(value);

    if (!isValidSegment(segment)) {
      throw new Error(`No valid code abbreviation for ${attribute.name} "${value}"`);
    }
    segments.push(segment);
  }

  return segments.join("-");
}
