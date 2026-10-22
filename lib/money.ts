// All money is integer rupees. Every calculation that can produce a fraction
// (price × decimal qty, percentages, bill discount split) goes through here.

export type Qty = number | string | { toString(): string };

const QTY_SCALE = 1000;

/** Integer division rounded half away from zero. `divisor` must be positive. */
export function roundDiv(numerator: number, divisor: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new Error(
      `roundDiv needs safe integers and a positive divisor (${numerator}/${divisor})`,
    );
  }
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const result = sign * Math.floor((abs + Math.floor(divisor / 2)) / divisor);
  return result === 0 ? 0 : result;
}

/** Converts a quantity with up to 3 decimals to an integer count of thousandths, without float error. */
export function qtyToMilli(qty: Qty): number {
  const text = String(qty).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,3})0*)?$/.exec(text);
  if (!match) throw new Error(`Invalid quantity: "${text}"`);
  const [, sign, whole, fraction = ""] = match;
  const milli = Number(whole) * QTY_SCALE + Number(fraction.padEnd(3, "0"));
  return sign ? -milli : milli;
}

/** price × qty, rounded to the nearest rupee. */
export function lineAmount(unitPrice: number, qty: Qty): number {
  assertRupees(unitPrice);
  return roundDiv(unitPrice * qtyToMilli(qty), QTY_SCALE);
}

/** `percent`% of `amount`, rounded to the nearest rupee. */
export function percentOf(amount: number, percent: number): number {
  assertRupees(amount);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error(`Percent must be a whole number from 0 to 100, got ${percent}`);
  }
  return roundDiv(amount * percent, 100);
}

/** Discount in rupees for a gross amount. Never more than the amount itself. */
export function discountAmount(gross: number, type: "AMOUNT" | "PERCENT", value: number): number {
  assertRupees(gross);
  assertRupees(value);
  const discount = type === "PERCENT" ? percentOf(gross, value) : value;
  return Math.min(discount, gross);
}

/**
 * Splits a bill-level discount across lines in proportion to each line total.
 * Uses the largest-remainder method, so the shares always add up exactly to
 * `discount` and no line gets more than its own total.
 */
export function splitBillDiscount(lineTotals: number[], discount: number): number[] {
  lineTotals.forEach(assertRupees);
  assertRupees(discount);
  const sum = lineTotals.reduce((a, b) => a + b, 0);
  if (discount > sum) throw new Error(`Bill discount ${discount} is more than the subtotal ${sum}`);
  if (discount === 0 || sum === 0) return lineTotals.map(() => 0);

  const shares = lineTotals.map((total) => Math.floor((total * discount) / sum));
  let leftover = discount - shares.reduce((a, b) => a + b, 0);

  const byRemainder = lineTotals
    .map((total, index) => ({ index, remainder: (total * discount) % sum }))
    .sort((a, b) => b.remainder - a.remainder || lineTotals[b.index] - lineTotals[a.index]);

  for (const { index } of byRemainder) {
    if (leftover === 0) break;
    shares[index] += 1;
    leftover -= 1;
  }
  return shares;
}

function assertRupees(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Money must be a non-negative whole number of rupees, got ${value}`);
  }
}
