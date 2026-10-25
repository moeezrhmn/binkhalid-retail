import { describe, expect, it } from "vitest";
import { todayRange, type DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { createReturn } from "@/server/services/returns";
import { buildReport, salesByDay, salesTotals } from "@/server/services/reports";
import { completeSale } from "@/server/services/sales";
import { shopFixture } from "./fixtures";

const wide: DateRange = {
  from: new Date("2000-01-01T00:00:00Z"),
  to: new Date("2100-01-01T00:00:00Z"),
};

/** Black caps cost 300 and sell for 650; the suit costs 200/m and sells for 333/m. */
async function tradingDay() {
  const fx = await shopFixture();
  const admin = fx.user;
  const staff = await db.user.create({
    data: { name: "Bilal", type: "STAFF", username: "bilal", passwordHash: "x" },
  });

  // Bill 1 (staff): 2 caps, bill discount 100 → paid 1200, cost 600
  const bill1 = await completeSale(
    {
      customerId: fx.customer.id,
      lines: [{ variantId: fx.black.id, qty: "2", discount: 0 }],
      billDiscount: 100,
      payments: [{ method: "CASH", amount: 1200 }],
    },
    staff.id,
  );
  // Bill 2 (admin): 3 m suit = 999, paid by card 499 + udhaar 500, cost 600
  await completeSale(
    {
      customerId: fx.customer.id,
      lines: [{ variantId: fx.suit.id, qty: "3", discount: 0 }],
      billDiscount: 0,
      payments: [
        { method: "CARD", amount: 499 },
        { method: "CREDIT", amount: 500 },
      ],
    },
    admin.id,
  );
  // One cap from bill 1 comes back damaged (not restocked): refund 600 cash
  const item = await db.saleItem.findFirstOrThrow({ where: { saleId: bill1.id } });
  await createReturn({
    type: "RETURN",
    originalSaleId: bill1.id,
    items: [{ saleItemId: item.id, qty: "1", restock: false }],
    refunds: [{ method: "CASH", amount: 600 }],
    userId: admin.id,
  });
  return fx;
}

describe("reports", () => {
  it("net sales and profit take returns off; damaged returns keep their cost as a loss", async () => {
    await tradingDay();
    const totals = await salesTotals(wide);
    // sales 1200 + 999 − return 600 = 1599
    expect(totals.netSales).toBe(1599);
    // profit: (1200 − 600) + (999 − 600) − 600 refunded + 0 cost back (damaged) = 399
    expect(totals.profit).toBe(399);
    expect(totals.bills).toBe(2);
    expect(totals.creditOutstanding).toBe(500);
  });

  it("restocked returns give their cost back", async () => {
    const fx = await shopFixture();
    const sale = await completeSale(
      {
        customerId: fx.customer.id,
        lines: [{ variantId: fx.black.id, qty: "1", discount: 0 }],
        billDiscount: 0,
        payments: [{ method: "CASH", amount: 650 }],
      },
      fx.user.id,
    );
    const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    await createReturn({
      type: "RETURN",
      originalSaleId: sale.id,
      items: [{ saleItemId: item.id, qty: "1", restock: true }],
      refunds: [{ method: "CASH", amount: 650 }],
      userId: fx.user.id,
    });
    expect(await salesTotals(wide)).toMatchObject({ netSales: 0, profit: 0 });
  });

  it("splits sales by product, category, payment method and staff", async () => {
    await tradingDay();
    const product = await buildReport("sales-by-product", wide);
    expect(product.rows.map((r) => [r.product, r.qty, r.returned, r.sales, r.profit])).toEqual([
      ["Wash and Wear", 3, 0, 999, 399],
      ["Velvet Cap", 2, 1, 600, 0],
    ]);
    expect(product.totals).toMatchObject({ sales: 1599, profit: 399 });

    const category = await buildReport("sales-by-category", wide);
    expect(category.rows.map((r) => [r.category, r.sales, r.share])).toEqual([
      ["Suits", 999, 62.5],
      ["Caps", 600, 37.5],
    ]);

    const payment = await buildReport("sales-by-payment", wide);
    expect(payment.rows.map((r) => [r.method, r.sales, r.refunds, r.net])).toEqual([
      ["Cash", 1200, 600, 600],
      ["Card", 499, 0, 499],
      ["Udhaar", 500, 0, 500],
    ]);

    const staff = await buildReport("sales-by-staff", wide);
    expect(staff.rows.map((r) => [r.staff, r.bills, r.sales, r.returns, r.net])).toEqual([
      ["Bilal", 1, 1200, 600, 600],
      ["Cashier", 1, 999, 0, 999],
    ]);
  });

  it("lists slow movers (unsold first) and stock reports", async () => {
    await tradingDay();
    const slow = await buildReport("slow-moving", wide);
    // White cap never sold and has 1 in stock; it comes before the items that sold.
    expect(slow.rows[0]).toMatchObject({ code: "CAP-0001-WHT", sold: 0, stock: 1, value: 300 });

    const low = await buildReport("low-stock", wide);
    expect(low.rows.map((r) => r.code)).toEqual(["CAP-0001-WHT"]); // 1 left, minimum 2

    const stock = await buildReport("current-stock", wide);
    const black = stock.rows.find((r) => r.code === "CAP-0001-BLK")!;
    expect(black).toMatchObject({ stock: 8, costValue: 2400, saleValue: 5200 });
  });

  it("counts days in Pakistan time", async () => {
    const fx = await shopFixture();
    const sale = await completeSale(
      {
        customerId: fx.customer.id,
        lines: [{ variantId: fx.black.id, qty: "1", discount: 0 }],
        billDiscount: 0,
        payments: [{ method: "CASH", amount: 650 }],
      },
      fx.user.id,
    );
    // 00:30 on 23 Oct in Pakistan is still 22 Oct in UTC
    await db.sale.update({
      where: { id: sale.id },
      data: { completedAt: new Date("2026-10-22T19:30:00Z") },
    });
    const days = await salesByDay({
      from: new Date("2026-10-21T19:00:00Z"),
      to: new Date("2026-10-23T19:00:00Z"),
    });
    expect(days.map((d) => [d.day, d.amount])).toEqual([
      ["2026-10-22", 0],
      ["2026-10-23", 650],
    ]);
    expect(await salesTotals(todayRange(new Date("2026-10-23T10:00:00Z")))).toMatchObject({
      netSales: 650,
    });
  });
});
