import { SHOP_TIME_ZONE } from "./dates";
import type { Qty } from "./money";

const rupees = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1500 → "Rs 1,500", -200 → "-Rs 200" */
export function formatRs(amount: number): string {
  const text = `Rs ${rupees.format(Math.abs(amount))}`;
  return amount < 0 ? `-${text}` : text;
}

/** "2.500" → "2.5", "3.000" → "3" */
export function formatQty(qty: Qty): string {
  const text = String(qty);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const dateOnly = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHOP_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

export function formatDate(date: Date): string {
  return dateOnly.format(date);
}

/** Pakistani mobile numbers to one form: "+92 300-1234567" → "03001234567". Empty → null. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2)}`;
  if (digits.startsWith("3") && digits.length === 10) return `0${digits}`;
  return digits;
}
