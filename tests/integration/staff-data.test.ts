import { describe, expect, it } from "vitest";
import { createCustomer, searchCustomers } from "@/server/services/customers";
import { getHeldSale, holdSale, lookupForPos } from "@/server/services/sales";
import { shopFixture } from "./fixtures";

// Staff use the POS. What it sends to the browser must not reveal cost prices,
// profit or customers' udhaar.

const FORBIDDEN = /cost|profit|margin|balance|udhaar|credit/i;

function keysDeep(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => keysDeep(item, prefix));
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.entries(value).flatMap(([key, v]) => [
      `${prefix}${key}`,
      ...keysDeep(v, `${prefix}${key}.`),
    ]);
  }
  return [];
}

describe("data sent to the POS", () => {
  it("item lookup (scan and name search) carries no cost or profit", async () => {
    await shopFixture();
    const byCode = await lookupForPos("CAP-0001-BLK");
    const byName = await lookupForPos("velvet");
    expect(byCode.exact).not.toBeNull();
    expect(byName.matches.length).toBeGreaterThan(0);
    for (const result of [byCode, byName]) {
      expect(keysDeep(result).filter((key) => FORBIDDEN.test(key))).toEqual([]);
    }
  });

  it("a resumed held bill carries no cost", async () => {
    const { black, user } = await shopFixture();
    const held = await holdSale(
      { lines: [{ variantId: black.id, qty: "1", discount: 0 }], billDiscount: 0 },
      user.id,
    );
    const loaded = await getHeldSale(held.id);
    expect(keysDeep(loaded).filter((key) => FORBIDDEN.test(key))).toEqual([]);
  });

  it("customer search shows only name and phone, even for customers with udhaar", async () => {
    const { user } = await shopFixture();
    await createCustomer(
      { name: "Udhaar Wala", phone: "03451234567", openingBalance: 5000 },
      user.id,
    );
    for (const q of ["udhaar", "0345"]) {
      const results = await searchCustomers(q);
      expect(results.length).toBe(1);
      expect(Object.keys(results[0]).sort()).toEqual(["id", "name", "phone"]);
    }
  });
});
