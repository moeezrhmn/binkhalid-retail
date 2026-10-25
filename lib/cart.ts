import { discountAmount, lineAmount, type Qty } from "./money";

// Cart math shared by the POS screen (live totals) and the server (the real
// numbers, from current prices). Line discounts are rupees for the whole line.

export const PAYMENT_METHODS = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "JAZZCASH",
  "EASYPAISA",
  "CREDIT",
] as const;
export type SalePaymentMethod = (typeof PAYMENT_METHODS)[number];

export const METHOD_LABELS: Record<SalePaymentMethod | "EXCHANGE", string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  CREDIT: "Udhaar",
  EXCHANGE: "Exchange",
};

export function priceLine(unitPrice: number, qty: Qty, discount: number) {
  const gross = lineAmount(unitPrice, qty);
  const lineDiscount = Math.min(Math.max(0, Math.round(discount) || 0), gross);
  return { gross, discount: lineDiscount, lineTotal: gross - lineDiscount };
}

/** The product's own discount for a line, used as the default line discount at POS. */
export function productLineDiscount(
  unitPrice: number,
  qty: Qty,
  discount: { type: "AMOUNT" | "PERCENT"; value: number } | null,
) {
  if (!discount) return 0;
  const gross = lineAmount(unitPrice, qty);
  if (discount.type === "PERCENT") return discountAmount(gross, "PERCENT", discount.value);
  return Math.min(lineAmount(discount.value, qty), gross);
}

export function cartTotals(lineTotals: number[], billDiscount: number) {
  const subtotal = lineTotals.reduce((sum, total) => sum + total, 0);
  const discount = Math.min(Math.max(0, Math.round(billDiscount) || 0), subtotal);
  return { subtotal, discount, total: subtotal - discount };
}
