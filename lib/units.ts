import { qtyToMilli, type Qty } from "./money";

export const UNITS = ["PIECE", "BOTTLE", "METER", "ML", "GRAM"] as const;
export type UnitCode = (typeof UNITS)[number];

export const UNIT_LABELS: Record<UnitCode, string> = {
  PIECE: "Piece",
  BOTTLE: "Bottle",
  METER: "Meter",
  ML: "ml",
  GRAM: "Gram",
};

const FRACTIONAL_UNITS: ReadonlySet<UnitCode> = new Set(["METER", "ML", "GRAM"]);

export function allowsFraction(unit: UnitCode): boolean {
  return FRACTIONAL_UNITS.has(unit);
}

/**
 * Returns an error message, or null when the quantity is valid for the unit.
 * Sold quantities must be more than 0; stock levels (`allowZero`) may be 0.
 */
export function validateQty(
  unit: UnitCode,
  qty: Qty,
  { allowZero = false }: { allowZero?: boolean } = {},
): string | null {
  let milli: number;
  try {
    milli = qtyToMilli(qty);
  } catch {
    return "Enter a valid quantity (up to 3 decimals)";
  }
  if (milli < 0 || (milli === 0 && !allowZero)) {
    return allowZero ? "Quantity cannot be negative" : "Quantity must be more than 0";
  }
  if (!allowsFraction(unit) && milli % 1000 !== 0) {
    return `${UNIT_LABELS[unit]} quantities must be whole numbers`;
  }
  return null;
}
