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
const PREFIX = /^[A-Z]{2,4}$/;

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

export function isValidPrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

/**
 * A starting suggestion for an option's abbreviation, which the admin can edit.
 * Short values are kept ("M", "Grey" → "GREY", "500 g" → "500G"); several words
 * become their initials ("Navy Blue" → "NB"); a longer word becomes first letter
 * + first and last consonant ("Black" → "BLK", "Maroon" → "MRN").
 */
export function suggestAbbrev(value: string): string {
  const clean = toCodeSegment(value);
  if (clean.length <= 4 || /\d/.test(clean)) return clean.slice(0, 6);
  const words = value
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length > 1)
    return words
      .map((word) => toCodeSegment(word)[0] ?? "")
      .join("")
      .slice(0, 4);
  const [first, ...rest] = clean;
  const consonants = rest.filter((letter) => !"AEIOU".includes(letter));
  if (consonants.length < 2) return clean.slice(0, 3);
  return first + consonants[0] + consonants[consonants.length - 1];
}

export function formatProductSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid product number: ${seq}`);
  return String(seq).padStart(4, "0");
}

function attributeSegments(attributes: CodeAttribute[], values: Record<string, string>) {
  const segments: string[] = [];
  const coded = attributes
    .filter((attribute) => attribute.usedInCode)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const attribute of coded) {
    const value = values[attribute.name]?.trim();
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
  return segments;
}

export function buildVariantCode(input: {
  prefix: string;
  productSeq: number;
  attributes: CodeAttribute[];
  values: Record<string, string>;
}): string {
  const prefix = normalizeCode(input.prefix);
  if (!isValidSegment(prefix)) throw new Error(`Invalid category prefix: "${input.prefix}"`);

  return [
    prefix,
    formatProductSeq(input.productSeq),
    ...attributeSegments(input.attributes, input.values),
  ].join("-");
}

/** What the code will look like before the product number is assigned: CAP-####-BLK-M */
export function previewVariantCode(input: {
  prefix: string;
  attributes: CodeAttribute[];
  values: Record<string, string>;
}): string {
  try {
    return [
      normalizeCode(input.prefix),
      "####",
      ...attributeSegments(input.attributes, input.values),
    ].join("-");
  } catch {
    return `${normalizeCode(input.prefix)}-####-?`;
  }
}
