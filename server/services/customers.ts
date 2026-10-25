import "server-only";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/format";
import { isUniqueViolation, UserError } from "./errors";

export type CustomerOption = { id: string; name: string; phone: string | null };

const select = { id: true, name: true, phone: true } as const;

/** Phone digits match from the start (instant lookup while typing); otherwise by name. */
export async function searchCustomers(q: string, take = 8): Promise<CustomerOption[]> {
  const term = q.trim();
  if (!term) return [];
  const digits = term.replace(/\D/g, "");
  const looksLikePhone = digits.length >= 3 && digits.length >= term.replace(/\s/g, "").length - 2;

  if (looksLikePhone) {
    const local = digits.startsWith("92")
      ? `0${digits.slice(2)}`
      : digits.startsWith("3")
        ? `0${digits}`
        : digits;
    return db.customer.findMany({
      where: { phone: { startsWith: local } },
      orderBy: { name: "asc" },
      take,
      select,
    });
  }
  return db.customer.findMany({
    where: { name: { contains: term, mode: "insensitive" } },
    orderBy: { name: "asc" },
    take,
    select,
  });
}

/** Existing customers whose name looks like this one, shown before adding a customer without a phone. */
export async function similarCustomers(name: string): Promise<CustomerOption[]> {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length >= 2);
  if (words.length === 0) return [];
  return db.customer.findMany({
    where: {
      AND: words.map((word) => ({ name: { contains: word, mode: "insensitive" as const } })),
    },
    orderBy: { name: "asc" },
    take: 5,
    select,
  });
}

export async function quickAddCustomer(input: {
  name: string;
  phone?: string | null;
}): Promise<CustomerOption> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new UserError("Enter the customer's name");
  const phone = normalizePhone(input.phone);
  if (phone && !/^0\d{9,11}$/.test(phone))
    throw new UserError("Enter a valid phone number, e.g. 0300 1234567");

  if (phone) {
    const existing = await db.customer.findUnique({ where: { phone }, select });
    if (existing) throw new UserError(`${phone} already belongs to ${existing.name}`);
  }
  try {
    return await db.customer.create({ data: { name, phone }, select });
  } catch (error) {
    if (isUniqueViolation(error))
      throw new UserError(`${phone} is already used by another customer`);
    throw error;
  }
}

export async function getCustomerOption(id: string): Promise<CustomerOption | null> {
  return db.customer.findUnique({ where: { id }, select });
}
