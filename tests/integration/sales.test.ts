import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  closeSession,
  currentSession,
  openSession,
  recordDrawerOut,
  summarize,
} from "@/server/services/cash";
import { createReturn } from "@/server/services/returns";
import {
  completeSale,
  discardHeldSale,
  getHeldSale,
  holdSale,
  listHeldSales,
} from "@/server/services/sales";
import { adjustStock, stockIn, stockMatchesMovements } from "@/server/services/stock";
import { flowsFor, shopFixture, stockOf } from "./fixtures";

describe("stock", () => {
  it("stock in and adjustments keep stock equal to its movements", async () => {
    const { black, suit } = await shopFixture();
    const supplier = await db.supplier.create({ data: { name: "Lahore Caps" } });

    await stockIn({
      supplierId: supplier.id,
      items: [
        { variantId: black.id, qty: "50", unitCost: 280, updateCost: true },
        { variantId: suit.id, qty: "12.5" },
      ],
    });
    expect(await stockOf(black.id)).toBe("60");
    expect(await stockOf(suit.id)).toBe("32.5");
    expect((await db.variant.findUniqueOrThrow({ where: { id: black.id } })).costPrice).toBe(280);

    await adjustStock({ variantId: black.id, reason: "Damage", qty: "1", note: "torn" });
    await adjustStock({ variantId: black.id, reason: "Count correction", qty: "55" });
    await adjustStock({ variantId: black.id, reason: "Other", qty: "-2", note: "gift" });
    expect(await stockOf(black.id)).toBe("53");

    const reasons = (
      await db.stockMovement.findMany({
        where: { variantId: black.id, type: "ADJUSTMENT" },
        orderBy: { createdAt: "asc" },
      })
    ).map((m) => [m.qty.toString(), m.reason]);
    expect(reasons).toEqual([
      ["-1", "Damage: torn"],
      ["-4", "Count correction (was 59, counted 55)"],
      ["-2", "Other: gift"],
    ]);
    expect(await stockMatchesMovements()).toBe(true);
  });

  it("rejects part pieces and a missing reason", async () => {
    const { black } = await shopFixture();
    await expect(stockIn({ items: [{ variantId: black.id, qty: "1.5" }] })).rejects.toThrow(
      /whole/,
    );
    await expect(
      adjustStock({ variantId: black.id, reason: "Other", qty: "1", note: " " }),
    ).rejects.toThrow(/reason/);
  });
});

describe("sales", () => {
  it("completes a cash sale: bill number, snapshots, payments and stock", async () => {
    const { black, suit, user, customer } = await shopFixture();
    // 2 × 650 − 100 = 1200; 2.5 m × 333 = 832.5 → 833; subtotal 2033 − 50 = 1983
    const sale = await completeSale(
      {
        customerId: customer.id,
        lines: [
          { variantId: black.id, qty: "2", discount: 100 },
          { variantId: suit.id, qty: "2.5", discount: 0 },
        ],
        billDiscount: 50,
        payments: [{ method: "CASH", amount: 1983 }],
        cashReceived: 2000,
      },
      user.id,
    );
    expect(sale).toMatchObject({ billNo: 1, total: 1983, change: 17 });

    const saved = await db.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: { orderBy: { codeSnapshot: "asc" } } },
    });
    expect(saved).toMatchObject({
      status: "COMPLETED",
      subtotal: 2033,
      discount: 50,
      total: 1983,
      cashReceived: 2000,
      changeGiven: 17,
      customerId: customer.id,
      userId: user.id,
    });
    expect(
      saved.items.map((i) => [i.codeSnapshot, i.priceSnapshot, i.costSnapshot, i.lineTotal]),
    ).toEqual([
      ["CAP-0001-BLK", 650, 300, 1200],
      ["SUT-0001", 333, 200, 833],
    ]);
    expect(saved.items.reduce((sum, item) => sum + item.billDiscountShare, 0)).toBe(50);
    expect(saved.items.reduce((sum, item) => sum + item.netTotal, 0)).toBe(1983);

    expect(await flowsFor({ saleId: sale.id })).toEqual([["SALE", "CASH", 1983]]);
    expect(await stockOf(black.id)).toBe("8");
    expect(await stockOf(suit.id)).toBe("17.5");
    expect(await stockMatchesMovements()).toBe(true);
  });

  it("splits a payment between cash and udhaar, and numbers bills in order", async () => {
    const { black, user, customer } = await shopFixture();
    const sell = (payments: { method: "CASH" | "CREDIT"; amount: number }[]) =>
      completeSale(
        {
          customerId: customer.id,
          lines: [{ variantId: black.id, qty: "1", discount: 0 }],
          billDiscount: 0,
          payments,
        },
        user.id,
      );
    const first = await sell([{ method: "CASH", amount: 650 }]);
    const second = await sell([
      { method: "CASH", amount: 400 },
      { method: "CREDIT", amount: 250 },
    ]);
    expect([first.billNo, second.billNo]).toEqual([1, 2]);

    const rows = await db.cashFlow.findMany({
      where: { saleId: second.id },
      orderBy: { amount: "desc" },
    });
    expect(rows.map((r) => [r.method, r.amount, r.customerId])).toEqual([
      ["CASH", 400, null],
      ["CREDIT", 250, customer.id],
    ]);
  });

  it("refuses bad bills and saves nothing", async () => {
    const { black, white, user, customer } = await shopFixture();
    const base = {
      customerId: customer.id,
      lines: [{ variantId: black.id, qty: "1", discount: 0 }],
      billDiscount: 0,
      payments: [{ method: "CASH" as const, amount: 650 }],
    };
    await expect(completeSale({ ...base, customerId: null }, user.id)).rejects.toThrow(/customer/);
    await expect(
      completeSale({ ...base, payments: [{ method: "CASH", amount: 600 }] }, user.id),
    ).rejects.toThrow(/Rs 50 is still unpaid/);
    await expect(
      completeSale({ ...base, lines: [{ variantId: black.id, qty: "1.5", discount: 0 }] }, user.id),
    ).rejects.toThrow(/whole/);
    await expect(completeSale({ ...base, cashReceived: 500 }, user.id)).rejects.toThrow(
      /at least Rs 650/,
    );
    await db.variant.update({ where: { id: white.id }, data: { isActive: false } });
    await expect(
      completeSale({ ...base, lines: [{ variantId: white.id, qty: "1", discount: 0 }] }, user.id),
    ).rejects.toThrow(/inactive/);

    expect(await db.sale.count()).toBe(0);
    expect(await db.cashFlow.count()).toBe(0);
    expect(await stockOf(black.id)).toBe("10");
    expect((await db.counter.findUnique({ where: { key: "bill" } }))?.value ?? 0).toBe(0);
  });

  it("allows selling past zero stock (it goes negative)", async () => {
    const { white, user, customer } = await shopFixture();
    await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: white.id, qty: "3", discount: 0 }],
        billDiscount: 0,
        payments: [{ method: "CARD", amount: 1950 }],
      },
      user.id,
    );
    expect(await stockOf(white.id)).toBe("-2");
    expect(await stockMatchesMovements()).toBe(true);
  });

  it("holds a bill without touching stock, then completes it with a bill number", async () => {
    const { black, user, customer } = await shopFixture();
    const held = await holdSale(
      { lines: [{ variantId: black.id, qty: "2", discount: 0 }], billDiscount: 0 },
      user.id,
    );
    expect(await stockOf(black.id)).toBe("10");
    expect((await db.sale.findUniqueOrThrow({ where: { id: held.id } })).billNo).toBeNull();
    expect((await listHeldSales()).map((s) => s.total)).toEqual([1300]);

    const loaded = await getHeldSale(held.id);
    expect(loaded?.lines.map((l) => [l.variant.code, l.qty])).toEqual([["CAP-0001-BLK", "2"]]);

    const done = await completeSale(
      {
        heldSaleId: held.id,
        customerId: customer.id,
        lines: [{ variantId: black.id, qty: "3", discount: 0 }],
        billDiscount: 0,
        payments: [{ method: "CASH", amount: 1950 }],
      },
      user.id,
    );
    expect(done.id).toBe(held.id);
    expect(done.billNo).toBe(1);
    expect(await db.saleItem.count({ where: { saleId: held.id } })).toBe(1);
    expect(await stockOf(black.id)).toBe("7");
    expect(await listHeldSales()).toEqual([]);
    await expect(discardHeldSale(held.id)).rejects.toThrow(/already completed/);
  });

  it("discards a held bill completely", async () => {
    const { black, user } = await shopFixture();
    const held = await holdSale(
      { lines: [{ variantId: black.id, qty: "1", discount: 0 }], billDiscount: 0 },
      user.id,
    );
    await discardHeldSale(held.id);
    expect(await db.sale.count()).toBe(0);
    expect(await db.saleItem.count()).toBe(0);
  });
});

describe("returns and exchanges", () => {
  async function soldBill() {
    const fixture = await shopFixture();
    // 3 caps at 650 = 1950, bill discount 150 → paid 1800 (600 a cap)
    const sale = await completeSale(
      {
        customerId: fixture.customer.id,
        lines: [{ variantId: fixture.black.id, qty: "3", discount: 0 }],
        billDiscount: 150,
        payments: [{ method: "CASH", amount: 1800 }],
      },
      fixture.user.id,
    );
    const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    return { ...fixture, sale, item };
  }

  it("refunds what the customer actually paid and restocks", async () => {
    const { black, user, sale, item } = await soldBill();
    const ret = await createReturn({
      type: "RETURN",
      originalSaleId: sale.id,
      items: [{ saleItemId: item.id, qty: "1", restock: true }],
      refunds: [{ method: "CASH", amount: 600 }],
      userId: user.id,
    });
    expect(ret).toMatchObject({ returnNo: 1, refundAmount: 600 });
    expect(await flowsFor({ saleReturnId: ret.id })).toEqual([["REFUND", "CASH", -600]]);
    expect(await stockOf(black.id)).toBe("8");
    expect(await stockMatchesMovements()).toBe(true);
  });

  it("never returns more than was sold, across several returns", async () => {
    const { user, sale, item } = await soldBill();
    const back = (qty: string, amount: number) =>
      createReturn({
        type: "RETURN",
        originalSaleId: sale.id,
        items: [{ saleItemId: item.id, qty, restock: false }],
        refunds: [{ method: "CASH", amount }],
        userId: user.id,
      });
    await back("2", 1200);
    await expect(back("2", 1200)).rejects.toThrow(/only 1 left/);
    await back("1", 600);
  });

  it("checks the refund adds up, and refunds udhaar to the customer", async () => {
    const { user, customer, sale, item } = await soldBill();
    const input = {
      type: "RETURN" as const,
      originalSaleId: sale.id,
      items: [{ saleItemId: item.id, qty: "1", restock: true }],
      userId: user.id,
    };
    await expect(
      createReturn({ ...input, refunds: [{ method: "CASH", amount: 650 }] }),
    ).rejects.toThrow(/add up to Rs 600/);
    const ret = await createReturn({ ...input, refunds: [{ method: "CREDIT", amount: 600 }] });
    const row = await db.cashFlow.findFirstOrThrow({ where: { saleReturnId: ret.id } });
    expect([row.method, row.amount, row.customerId]).toEqual(["CREDIT", -600, customer.id]);
  });

  it("takes returns without a bill at the amount given", async () => {
    const { suit, user } = await shopFixture();
    const ret = await createReturn({
      type: "RETURN",
      originalSaleId: null,
      items: [{ variantId: suit.id, qty: "1.5", restock: true, amount: 450 }],
      refunds: [{ method: "CASH", amount: 450 }],
      userId: user.id,
    });
    expect(ret.refundAmount).toBe(450);
    expect(await stockOf(suit.id)).toBe("21.5");
  });

  it("exchange for something dearer: return credit pays part, the rest is paid", async () => {
    const { black, suit, customer, user, sale, item } = await soldBill();
    const exchange = await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: suit.id, qty: "3", discount: 0 }], // 999
        billDiscount: 0,
        payments: [{ method: "CASH", amount: 399 }],
        exchange: {
          originalSaleId: sale.id,
          items: [{ saleItemId: item.id, qty: "1", restock: true }],
        },
      },
      user.id,
    );
    expect(await flowsFor({ saleId: exchange.id })).toEqual([
      ["SALE", "EXCHANGE", 600],
      ["SALE", "CASH", 399],
    ]);
    const ret = await db.saleReturn.findFirstOrThrow({ where: { originalSaleId: sale.id } });
    expect(ret).toMatchObject({ type: "EXCHANGE", refundAmount: 600, exchangeSaleId: exchange.id });
    expect(await flowsFor({ saleReturnId: ret.id })).toEqual([["REFUND", "EXCHANGE", -600]]);
    expect(await stockOf(black.id)).toBe("8");
    expect(await stockOf(suit.id)).toBe("17");
  });

  it("exchange for something cheaper: the difference goes back in cash", async () => {
    const { suit, customer, user, sale, item } = await soldBill();
    const exchange = await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: suit.id, qty: "1", discount: 0 }], // 333
        billDiscount: 0,
        payments: [],
        exchange: {
          originalSaleId: sale.id,
          items: [{ saleItemId: item.id, qty: "1", restock: true }],
        },
      },
      user.id,
    );
    expect(exchange.exchangeRefund).toBe(267);
    expect(await flowsFor({ saleId: exchange.id })).toEqual([
      ["SALE", "EXCHANGE", 600],
      ["SALE", "CASH", -267],
    ]);
    // Exchange credit nets to zero across the return and the new sale.
    const exchangeSum = await db.cashFlow.aggregate({
      where: { method: "EXCHANGE" },
      _sum: { amount: true },
    });
    expect(exchangeSum._sum.amount).toBe(0);
  });
});

describe("cash register", () => {
  it("expected cash = opening + cash sales + udhaar received − refunds − cash out − expenses", async () => {
    const { black, user, customer } = await shopFixture();
    await openSession(5000);
    await expect(openSession(100)).rejects.toThrow(/already open/);

    const sale = await completeSale(
      {
        customerId: customer.id,
        lines: [{ variantId: black.id, qty: "4", discount: 0 }],
        billDiscount: 0,
        payments: [
          { method: "CASH", amount: 1600 },
          { method: "JAZZCASH", amount: 1000 },
        ],
      },
      user.id,
    );
    await db.cashFlow.create({
      data: {
        type: "CREDIT_RECEIVED",
        method: "CASH",
        amount: 700,
        customerId: customer.id,
        userId: user.id,
      },
    });
    const item = await db.saleItem.findFirstOrThrow({ where: { saleId: sale.id } });
    await createReturn({
      type: "RETURN",
      originalSaleId: sale.id,
      items: [{ saleItemId: item.id, qty: "1", restock: true }],
      refunds: [{ method: "CASH", amount: 650 }],
      userId: user.id,
    });
    await recordDrawerOut({ type: "CASH_OUT", amount: 2000, note: "Owner", userId: user.id });
    await recordDrawerOut({ type: "EXPENSE", amount: 150, note: "Tea", userId: user.id });

    const session = (await currentSession())!;
    const summary = await summarize(session);
    expect(summary).toMatchObject({
      openingCash: 5000,
      cashSales: 1600,
      creditReceivedCash: 700,
      cashRefunds: 650,
      cashOut: 2000,
      expenses: 150,
      expectedCash: 5000 + 1600 + 700 - 650 - 2000 - 150,
      otherMethods: { JAZZCASH: 1000 },
      billCount: 1,
    });

    const closed = await closeSession(4400);
    expect(closed).toMatchObject({ expectedCash: 4500, countedCash: 4400 });
    expect(await currentSession()).toBeNull();
    await expect(
      recordDrawerOut({ type: "EXPENSE", amount: 0, note: "x", userId: user.id }),
    ).rejects.toThrow();
  });
});

describe("database connection", () => {
  it("runs hand-written SQL in the same schema as Prisma's queries", async () => {
    const [{ schema }] = await db.$queryRaw<
      { schema: string }[]
    >`SELECT current_schema() AS schema`;
    expect(schema).toBe(new URL(process.env.DATABASE_URL!).searchParams.get("schema"));
  });
});

describe("timestamps", () => {
  it("are stored in true UTC, whatever the database server's time zone", async () => {
    const when = new Date("2026-10-22T19:30:00Z");
    const supplier = await db.supplier.create({ data: { name: "Clock check", createdAt: when } });
    const [row] = await db.$queryRaw<{ utc: string }[]>`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS utc
      FROM "Supplier" WHERE id = ${supplier.id}::uuid`;
    expect(row.utc).toBe("2026-10-22 19:30");
    expect((await db.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).createdAt).toEqual(
      when,
    );
  });
});
