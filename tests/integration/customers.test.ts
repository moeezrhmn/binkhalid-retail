import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createCustomer,
  customerBalance,
  customerStatement,
  listCustomers,
  receivePayment,
  totalOutstanding,
  updateCustomer,
} from "@/server/services/customers";
import { createReturn } from "@/server/services/returns";
import { completeSale } from "@/server/services/sales";
import { shopFixture } from "./fixtures";

describe("customers and udhaar", () => {
  it("tracks the balance through old udhaar, udhaar sales, returns and payments", async () => {
    const { black, user } = await shopFixture();
    const customer = await createCustomer(
      { name: " Hamza  Ali ", phone: "+92 321 5550000", openingBalance: 2000 },
      user.id,
    );
    expect(customer).toMatchObject({ name: "Hamza Ali", phone: "03215550000" });
    expect(await customerBalance(customer.id)).toBe(2000);

    const sale = await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: black.id, qty: "2", discount: 0 }],
        billDiscount: 0,
        payments: [
          { method: "CASH", amount: 300 },
          { method: "CREDIT", amount: 1000 },
        ],
      },
      user.id,
    );
    expect(await customerBalance(customer.id)).toBe(3000);

    const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    await createReturn({
      type: "RETURN",
      originalSaleId: sale.id,
      items: [{ saleItemId: item.id, qty: "1", restock: true }],
      refunds: [{ method: "CREDIT", amount: 650 }],
      userId: user.id,
    });
    expect(await customerBalance(customer.id)).toBe(2350);

    await receivePayment({ customerId: customer.id, amount: 1350, method: "JAZZCASH" }, user.id);
    expect(await customerBalance(customer.id)).toBe(1000);
    await expect(
      receivePayment({ customerId: customer.id, amount: 1001, method: "CASH" }, user.id),
    ).rejects.toThrow(/owes only Rs 1000/);

    const statement = await customerStatement(customer.id);
    expect(statement.map((e) => [e.charge, e.payment, e.balance])).toEqual([
      [2000, 0, 2000],
      [1000, 0, 3000],
      [0, 650, 2350],
      [0, 1350, 1000],
    ]);
    expect(statement.map((e) => e.description)).toEqual([
      "Old udhaar (before this system)",
      `Udhaar on bill #${sale.billNo}`,
      `Return #1 (bill #${sale.billNo})`,
      "Payment received (JazzCash)",
    ]);
  });

  it("lists customers with balances and filters those who owe", async () => {
    const { user } = await shopFixture(); // includes "Ali Raza" with no udhaar
    const owes = await createCustomer(
      { name: "Bilal", phone: "03007654321", openingBalance: 500 },
      user.id,
    );
    await createCustomer({ name: "Zain", phone: null }, user.id);

    const all = await listCustomers({});
    expect(all.items.map((c) => [c.name, c.balance])).toEqual([
      ["Ali Raza", 0],
      ["Bilal", 500],
      ["Zain", 0],
    ]);
    expect((await listCustomers({ owing: true })).items.map((c) => c.id)).toEqual([owes.id]);
    expect((await listCustomers({ q: "7654" })).items.map((c) => c.name)).toEqual(["Bilal"]);
    expect(await totalOutstanding()).toBe(500);
  });

  it("refuses duplicate phones and bad input", async () => {
    const { user, customer } = await shopFixture();
    await expect(createCustomer({ name: "Copy", phone: customer.phone }, user.id)).rejects.toThrow(
      /already belongs/,
    );
    await expect(createCustomer({ name: " ", phone: null }, user.id)).rejects.toThrow(/name/);
    await expect(createCustomer({ name: "X", phone: "12" }, user.id)).rejects.toThrow(
      /valid phone/,
    );
    const other = await createCustomer({ name: "Other", phone: "03110000000" }, user.id);
    await expect(
      updateCustomer(other.id, { name: "Other", phone: customer.phone }),
    ).rejects.toThrow(/already belongs/);
  });
});
