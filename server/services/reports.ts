import "server-only";
import { Prisma, type CashFlowType, type PaymentMethod } from "@/generated/prisma/client";
import { METHOD_LABELS } from "@/lib/cart";
import { shopDate, SHOP_TIME_ZONE, toYmd, type DateRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { variantLabel } from "@/lib/variants";
import { summarize } from "./cash";
import { totalOutstanding } from "./customers";

// Sales are counted on the day they were completed and returns on the day they
// were made, so a return always lowers the period it happened in. Revenue is
// what customers actually paid (line total after every discount).

type VariantMetricsRow = {
  variantId: string;
  qtySold: Prisma.Decimal | null;
  revenue: bigint | null;
  cost: Prisma.Decimal | null;
  qtyReturned: Prisma.Decimal | null;
  returnAmount: bigint | null;
  costBack: Prisma.Decimal | null;
};

export type VariantMetric = {
  variantId: string;
  code: string;
  productName: string;
  variantText: string;
  categoryName: string;
  unit: keyof typeof UNIT_LABELS;
  isActive: boolean;
  stockQty: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  qtySold: number;
  qtyReturned: number;
  netQty: number;
  /** Sales minus returns, in rupees. */
  netSales: number;
  /** Profit after returns: returned goods that go back on the shelf give their cost back. */
  profit: number;
};

const n = (value: Prisma.Decimal | bigint | number | null | undefined) => Number(value ?? 0);
const negate = (value: number) => (value === 0 ? 0 : -value);

async function variantMetrics(
  range: DateRange,
): Promise<
  Map<
    string,
    Omit<
      VariantMetric,
      | "code"
      | "productName"
      | "variantText"
      | "categoryName"
      | "unit"
      | "isActive"
      | "stockQty"
      | "minStock"
      | "costPrice"
      | "salePrice"
    >
  >
> {
  const rows = await db.$queryRaw<VariantMetricsRow[]>`
    WITH sold AS (
      SELECT si."variantId", SUM(si.qty) AS qty, SUM(si."netTotal") AS revenue,
             SUM(si."costSnapshot" * si.qty) AS cost
      FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED' AND s."completedAt" >= ${range.from} AND s."completedAt" < ${range.to}
      GROUP BY si."variantId"
    ), returned AS (
      SELECT ri."variantId", SUM(ri.qty) AS qty, SUM(ri.amount) AS amount,
             SUM(CASE WHEN ri.restock THEN COALESCE(si."costSnapshot", v."costPrice") * ri.qty ELSE 0 END) AS cost_back
      FROM "SaleReturnItem" ri
      JOIN "SaleReturn" r ON r.id = ri."saleReturnId"
      JOIN "Variant" v ON v.id = ri."variantId"
      LEFT JOIN "SaleItem" si ON si.id = ri."saleItemId"
      WHERE r."createdAt" >= ${range.from} AND r."createdAt" < ${range.to}
      GROUP BY ri."variantId"
    )
    SELECT COALESCE(sold."variantId", returned."variantId") AS "variantId",
           sold.qty AS "qtySold", sold.revenue AS revenue, sold.cost AS cost,
           returned.qty AS "qtyReturned", returned.amount AS "returnAmount", returned.cost_back AS "costBack"
    FROM sold FULL OUTER JOIN returned ON sold."variantId" = returned."variantId"`;

  return new Map(
    rows.map((row) => {
      const revenue = n(row.revenue);
      const returnAmount = n(row.returnAmount);
      const qtySold = n(row.qtySold);
      const qtyReturned = n(row.qtyReturned);
      return [
        row.variantId,
        {
          variantId: row.variantId,
          qtySold,
          qtyReturned,
          netQty: qtySold - qtyReturned,
          netSales: revenue - returnAmount,
          profit: Math.round(revenue - n(row.cost) - returnAmount + n(row.costBack)),
        },
      ];
    }),
  );
}

/** Every variant (sold or not) with its sales for the period. */
export async function variantReport(
  range: DateRange,
  { includeUnsold = false } = {},
): Promise<VariantMetric[]> {
  const metrics = await variantMetrics(range);
  const variants = await db.variant.findMany({
    where: includeUnsold ? undefined : { id: { in: [...metrics.keys()] } },
    include: {
      product: {
        select: {
          name: true,
          unit: true,
          isActive: true,
          category: {
            select: { name: true, attributes: { select: { name: true, sortOrder: true } } },
          },
        },
      },
    },
  });
  return variants.map((v) => {
    const m = metrics.get(v.id);
    return {
      variantId: v.id,
      code: v.code,
      productName: v.product.name,
      variantText: variantLabel(
        v.attributes as Record<string, string>,
        v.product.category.attributes,
      ),
      categoryName: v.product.category.name,
      unit: v.product.unit,
      isActive: v.isActive && v.product.isActive,
      stockQty: n(v.stockQty),
      minStock: n(v.minStock),
      costPrice: v.costPrice,
      salePrice: v.salePrice,
      qtySold: m?.qtySold ?? 0,
      qtyReturned: m?.qtyReturned ?? 0,
      netQty: m?.netQty ?? 0,
      netSales: m?.netSales ?? 0,
      profit: m?.profit ?? 0,
    };
  });
}

export async function salesTotals(range: DateRange) {
  const metrics = [...(await variantMetrics(range)).values()];
  const bills = await db.sale.count({
    where: { status: "COMPLETED", completedAt: { gte: range.from, lt: range.to } },
  });
  return {
    netSales: metrics.reduce((s, m) => s + m.netSales, 0),
    profit: metrics.reduce((s, m) => s + m.profit, 0),
    bills,
    creditOutstanding: await totalOutstanding(),
  };
}

/** Net sales for each Pakistan calendar day in the range (days without sales are 0). */
export async function salesByDay(range: DateRange) {
  const rows = await db.$queryRaw<{ day: string; amount: bigint }[]>`
    WITH sold AS (
      SELECT to_char(s."completedAt" AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day,
             SUM(si."netTotal") AS amount
      FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
      WHERE s.status = 'COMPLETED' AND s."completedAt" >= ${range.from} AND s."completedAt" < ${range.to}
      GROUP BY 1
    ), returned AS (
      SELECT to_char(r."createdAt" AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day,
             -SUM(r."refundAmount") AS amount
      FROM "SaleReturn" r
      WHERE r."createdAt" >= ${range.from} AND r."createdAt" < ${range.to}
      GROUP BY 1
    )
    SELECT day, SUM(amount) AS amount FROM (SELECT * FROM sold UNION ALL SELECT * FROM returned) t
    GROUP BY day`;
  const byDay = new Map(rows.map((row) => [row.day, Number(row.amount)]));

  const days: { day: string; amount: number }[] = [];
  const last = toYmd(shopDate(new Date(range.to.getTime() - 1)));
  for (let ymd = shopDate(range.from); ;) {
    const day = toYmd(ymd);
    days.push({ day, amount: byDay.get(day) ?? 0 });
    if (day >= last || days.length > 400) break;
    const next = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + 1));
    ymd = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }
  return days;
}

// ----- Report tables (shared by the screen, Excel export and print) -----

export type ColumnFormat = "text" | "rs" | "qty" | "int" | "pct" | "datetime";
export type ReportColumn = { key: string; label: string; format: ColumnFormat };
export type ReportRow = Record<string, string | number | Date | null>;
export type ReportTable = {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  note?: string;
};

export const REPORTS = [
  { key: "sales-by-product", label: "Sales by product" },
  { key: "sales-by-category", label: "Sales by category" },
  { key: "sales-by-payment", label: "Sales by payment method" },
  { key: "sales-by-staff", label: "Sales by staff" },
  { key: "top-selling", label: "Top-selling products" },
  { key: "slow-moving", label: "Slow-moving products" },
  { key: "profit", label: "Profit" },
  { key: "current-stock", label: "Current stock" },
  { key: "low-stock", label: "Low stock" },
  { key: "cash-summary", label: "Daily cash summary" },
  { key: "cash-flow", label: "Cash flow" },
] as const;
export type ReportKey = (typeof REPORTS)[number]["key"];

/** Reports that ignore the date range (they show stock as it is now). */
export const UNDATED: ReadonlySet<ReportKey> = new Set(["current-stock", "low-stock"]);

const sum = (rows: ReportRow[], key: string) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

function itemName(v: VariantMetric) {
  return v.variantText ? `${v.productName} · ${v.variantText}` : v.productName;
}

async function byProduct(range: DateRange): Promise<ReportTable> {
  const variants = await variantReport(range);
  const byProductName = new Map<string, ReportRow>();
  for (const v of variants) {
    const key = `${v.categoryName}|${v.productName}`;
    const row = byProductName.get(key) ?? {
      product: v.productName,
      category: v.categoryName,
      qty: 0,
      returned: 0,
      sales: 0,
      profit: 0,
    };
    row.qty = Number(row.qty) + v.qtySold;
    row.returned = Number(row.returned) + v.qtyReturned;
    row.sales = Number(row.sales) + v.netSales;
    row.profit = Number(row.profit) + v.profit;
    byProductName.set(key, row);
  }
  const rows = [...byProductName.values()].sort((a, b) => Number(b.sales) - Number(a.sales));
  return {
    title: "Sales by product",
    description: "What each product sold, after returns and every discount.",
    columns: [
      { key: "product", label: "Product", format: "text" },
      { key: "category", label: "Category", format: "text" },
      { key: "qty", label: "Qty sold", format: "qty" },
      { key: "returned", label: "Qty returned", format: "qty" },
      { key: "sales", label: "Net sales", format: "rs" },
      { key: "profit", label: "Profit", format: "rs" },
    ],
    rows,
    totals: {
      product: "Total",
      qty: sum(rows, "qty"),
      returned: sum(rows, "returned"),
      sales: sum(rows, "sales"),
      profit: sum(rows, "profit"),
    },
  };
}

async function byCategory(range: DateRange): Promise<ReportTable> {
  const variants = await variantReport(range);
  const map = new Map<string, ReportRow>();
  for (const v of variants) {
    const row = map.get(v.categoryName) ?? {
      category: v.categoryName,
      qty: 0,
      sales: 0,
      profit: 0,
      share: 0,
    };
    row.qty = Number(row.qty) + v.netQty;
    row.sales = Number(row.sales) + v.netSales;
    row.profit = Number(row.profit) + v.profit;
    map.set(v.categoryName, row);
  }
  const rows = [...map.values()].sort((a, b) => Number(b.sales) - Number(a.sales));
  const total = sum(rows, "sales");
  for (const row of rows) row.share = pct(Number(row.sales), total);
  return {
    title: "Sales by category",
    description: "Net sales and profit for each category.",
    columns: [
      { key: "category", label: "Category", format: "text" },
      { key: "qty", label: "Net qty", format: "qty" },
      { key: "sales", label: "Net sales", format: "rs" },
      { key: "share", label: "Share of sales", format: "pct" },
      { key: "profit", label: "Profit", format: "rs" },
    ],
    rows,
    totals: {
      category: "Total",
      qty: sum(rows, "qty"),
      sales: total,
      share: rows.length ? 100 : 0,
      profit: sum(rows, "profit"),
    },
  };
}

async function byPayment(range: DateRange): Promise<ReportTable> {
  const groups = await db.cashFlow.groupBy({
    by: ["type", "method"],
    where: { type: { in: ["SALE", "REFUND"] }, createdAt: { gte: range.from, lt: range.to } },
    _sum: { amount: true },
  });
  const methods: PaymentMethod[] = [
    "CASH",
    "CARD",
    "BANK_TRANSFER",
    "JAZZCASH",
    "EASYPAISA",
    "CREDIT",
  ];
  const amount = (type: CashFlowType, method: PaymentMethod) =>
    groups
      .filter((g) => g.type === type && g.method === method)
      .reduce((s, g) => s + (g._sum.amount ?? 0), 0);
  const rows = methods
    .map((method) => {
      const sales = amount("SALE", method);
      const refunds = negate(amount("REFUND", method));
      return { method: METHOD_LABELS[method], sales, refunds, net: sales - refunds } as ReportRow;
    })
    .filter((row) => row.sales !== 0 || row.refunds !== 0);
  return {
    title: "Sales by payment method",
    description:
      "Money taken and refunded per payment method. Udhaar is credit given, not money received.",
    columns: [
      { key: "method", label: "Method", format: "text" },
      { key: "sales", label: "Taken", format: "rs" },
      { key: "refunds", label: "Refunded", format: "rs" },
      { key: "net", label: "Net", format: "rs" },
    ],
    rows,
    totals: {
      method: "Total",
      sales: sum(rows, "sales"),
      refunds: sum(rows, "refunds"),
      net: sum(rows, "net"),
    },
    note: "Exchanges are left out: the returned goods paid for the new ones.",
  };
}

async function byStaff(range: DateRange): Promise<ReportTable> {
  const rows = await db.$queryRaw<
    { name: string; bills: bigint; sales: bigint; returns: bigint }[]
  >`
    WITH sold AS (
      SELECT s."userId", COUNT(DISTINCT s.id) AS bills, SUM(si."netTotal") AS sales
      FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id
      WHERE s.status = 'COMPLETED' AND s."completedAt" >= ${range.from} AND s."completedAt" < ${range.to}
      GROUP BY s."userId"
    ), returned AS (
      SELECT s."userId", SUM(r."refundAmount") AS returns
      FROM "SaleReturn" r JOIN "Sale" s ON s.id = r."originalSaleId"
      WHERE r."createdAt" >= ${range.from} AND r."createdAt" < ${range.to}
      GROUP BY s."userId"
    )
    SELECT u.name, COALESCE(sold.bills, 0) AS bills, COALESCE(sold.sales, 0) AS sales,
           COALESCE(returned.returns, 0) AS returns
    FROM "User" u
    LEFT JOIN sold ON sold."userId" = u.id
    LEFT JOIN returned ON returned."userId" = u.id
    WHERE sold."userId" IS NOT NULL OR returned."userId" IS NOT NULL
    ORDER BY COALESCE(sold.sales, 0) DESC`;
  const table = rows.map((row) => {
    const sales = Number(row.sales);
    const returns = Number(row.returns);
    const bills = Number(row.bills);
    return {
      staff: row.name,
      bills,
      sales,
      returns,
      net: sales - returns,
      average: bills ? Math.round(sales / bills) : 0,
    };
  });
  return {
    title: "Sales by staff",
    description:
      "Bills each salesperson completed. Returns count against whoever made the original bill.",
    columns: [
      { key: "staff", label: "Salesperson", format: "text" },
      { key: "bills", label: "Bills", format: "int" },
      { key: "sales", label: "Sales", format: "rs" },
      { key: "returns", label: "Returns", format: "rs" },
      { key: "net", label: "Net sales", format: "rs" },
      { key: "average", label: "Average bill", format: "rs" },
    ],
    rows: table,
    totals: {
      staff: "Total",
      bills: sum(table, "bills"),
      sales: sum(table, "sales"),
      returns: sum(table, "returns"),
      net: sum(table, "net"),
    },
  };
}

async function topSelling(range: DateRange, limit = 20): Promise<ReportTable> {
  const variants = (await variantReport(range))
    .filter((v) => v.netQty > 0)
    .sort((a, b) => b.netQty - a.netQty || b.netSales - a.netSales)
    .slice(0, limit);
  return {
    title: "Top-selling products",
    description: `The ${limit} best sellers by quantity, after returns.`,
    columns: [
      { key: "rank", label: "#", format: "int" },
      { key: "item", label: "Item", format: "text" },
      { key: "code", label: "Code", format: "text" },
      { key: "qty", label: "Qty sold", format: "qty" },
      { key: "sales", label: "Net sales", format: "rs" },
      { key: "stock", label: "In stock", format: "qty" },
    ],
    rows: variants.map((v, i) => ({
      rank: i + 1,
      item: itemName(v),
      code: v.code,
      qty: v.netQty,
      sales: v.netSales,
      stock: v.stockQty,
    })),
  };
}

async function slowMoving(range: DateRange): Promise<ReportTable> {
  const variants = (await variantReport(range, { includeUnsold: true }))
    .filter((v) => v.isActive && v.stockQty > 0)
    .sort((a, b) => a.netQty - b.netQty || b.stockQty * b.costPrice - a.stockQty * a.costPrice)
    .slice(0, 100);
  const rows = variants.map((v) => ({
    item: itemName(v),
    code: v.code,
    sold: v.netQty,
    stock: v.stockQty,
    value: Math.round(v.stockQty * v.costPrice),
  }));
  return {
    title: "Slow-moving products",
    description:
      "Items in stock that sold least (or not at all) in the period, with the money tied up in them.",
    columns: [
      { key: "item", label: "Item", format: "text" },
      { key: "code", label: "Code", format: "text" },
      { key: "sold", label: "Sold in period", format: "qty" },
      { key: "stock", label: "In stock", format: "qty" },
      { key: "value", label: "Stock value at cost", format: "rs" },
    ],
    rows,
    totals: { item: "Total", stock: sum(rows, "stock"), value: sum(rows, "value") },
  };
}

async function profit(range: DateRange): Promise<ReportTable> {
  const variants = await variantReport(range);
  const rows = variants
    .map((v) => ({
      item: itemName(v),
      code: v.code,
      qty: v.netQty,
      sales: v.netSales,
      cost: v.netSales - v.profit,
      profit: v.profit,
      margin: pct(v.profit, v.netSales),
    }))
    .sort((a, b) => b.profit - a.profit);
  const sales = sum(rows, "sales");
  const profitTotal = sum(rows, "profit");
  return {
    title: "Profit",
    description:
      "Net sales minus cost (the cost price saved on each bill). Damaged returns keep their cost as a loss.",
    columns: [
      { key: "item", label: "Item", format: "text" },
      { key: "code", label: "Code", format: "text" },
      { key: "qty", label: "Net qty", format: "qty" },
      { key: "sales", label: "Net sales", format: "rs" },
      { key: "cost", label: "Cost", format: "rs" },
      { key: "profit", label: "Profit", format: "rs" },
      { key: "margin", label: "Margin", format: "pct" },
    ],
    rows,
    totals: {
      item: "Total",
      qty: sum(rows, "qty"),
      sales,
      cost: sum(rows, "cost"),
      profit: profitTotal,
      margin: pct(profitTotal, sales),
    },
  };
}

async function stockTable(lowOnly: boolean): Promise<ReportTable> {
  const variants = await db.variant.findMany({
    where: {
      isActive: true,
      product: { isActive: true },
      ...(lowOnly ? { stockQty: { lte: db.variant.fields.minStock } } : {}),
    },
    orderBy: [{ product: { name: "asc" } }, { code: "asc" }],
    include: {
      product: {
        select: {
          name: true,
          unit: true,
          category: {
            select: { name: true, attributes: { select: { name: true, sortOrder: true } } },
          },
        },
      },
    },
  });
  const rows = variants.map((v) => {
    const stock = n(v.stockQty);
    const label = variantLabel(
      v.attributes as Record<string, string>,
      v.product.category.attributes,
    );
    return {
      item: label ? `${v.product.name} · ${label}` : v.product.name,
      code: v.code,
      category: v.product.category.name,
      unit: UNIT_LABELS[v.product.unit],
      stock,
      min: n(v.minStock),
      costValue: Math.round(stock * v.costPrice),
      saleValue: Math.round(stock * v.salePrice),
    };
  });
  return lowOnly
    ? {
        title: "Low stock",
        description: "Items at or below their minimum stock. Reorder these.",
        columns: [
          { key: "item", label: "Item", format: "text" },
          { key: "code", label: "Code", format: "text" },
          { key: "category", label: "Category", format: "text" },
          { key: "stock", label: "In stock", format: "qty" },
          { key: "min", label: "Minimum", format: "qty" },
          { key: "unit", label: "Unit", format: "text" },
        ],
        rows: rows.sort((a, b) => a.stock - b.stock),
      }
    : {
        title: "Current stock",
        description: "Everything in stock right now, with its value at cost and at sale price.",
        columns: [
          { key: "item", label: "Item", format: "text" },
          { key: "code", label: "Code", format: "text" },
          { key: "category", label: "Category", format: "text" },
          { key: "stock", label: "In stock", format: "qty" },
          { key: "unit", label: "Unit", format: "text" },
          { key: "costValue", label: "Value at cost", format: "rs" },
          { key: "saleValue", label: "Value at sale price", format: "rs" },
        ],
        rows,
        totals: {
          item: "Total",
          costValue: sum(rows, "costValue"),
          saleValue: sum(rows, "saleValue"),
        },
      };
}

async function cashSummary(range: DateRange): Promise<ReportTable> {
  const sessions = await db.cashSession.findMany({
    where: { openedAt: { gte: range.from, lt: range.to } },
    orderBy: { openedAt: "asc" },
  });
  const rows: ReportRow[] = [];
  for (const session of sessions) {
    const s = await summarize(session);
    const other = Object.values(s.otherMethods).reduce((total, amount) => total + (amount ?? 0), 0);
    rows.push({
      opened: session.openedAt,
      opening: s.openingCash,
      cashSales: s.cashSales,
      udhaarReceived: s.creditReceivedCash,
      otherMethods: other,
      creditGiven: s.creditGiven,
      refunds: s.cashRefunds,
      cashOut: s.cashOut,
      expenses: s.expenses,
      expected: s.expectedCash,
      counted: session.countedCash,
      difference: session.countedCash === null ? null : session.countedCash - s.expectedCash,
    });
  }
  return {
    title: "Daily cash summary",
    description:
      "One row per register day: what came into and went out of the drawer, and how the count matched.",
    columns: [
      { key: "opened", label: "Day opened", format: "datetime" },
      { key: "opening", label: "Opening", format: "rs" },
      { key: "cashSales", label: "Cash sales", format: "rs" },
      { key: "udhaarReceived", label: "Udhaar received", format: "rs" },
      { key: "otherMethods", label: "Card / bank / wallets", format: "rs" },
      { key: "creditGiven", label: "Udhaar given", format: "rs" },
      { key: "refunds", label: "Cash refunds", format: "rs" },
      { key: "cashOut", label: "Cash out", format: "rs" },
      { key: "expenses", label: "Expenses", format: "rs" },
      { key: "expected", label: "Expected cash", format: "rs" },
      { key: "counted", label: "Counted", format: "rs" },
      { key: "difference", label: "Difference", format: "rs" },
    ],
    rows,
    totals: {
      opened: "Total",
      cashSales: sum(rows, "cashSales"),
      udhaarReceived: sum(rows, "udhaarReceived"),
      otherMethods: sum(rows, "otherMethods"),
      creditGiven: sum(rows, "creditGiven"),
      refunds: sum(rows, "refunds"),
      cashOut: sum(rows, "cashOut"),
      expenses: sum(rows, "expenses"),
      difference: sum(rows, "difference"),
    },
    note: rows.length ? undefined : "No register days were opened in this period.",
  };
}

const TYPE_LABELS: Record<CashFlowType, string> = {
  SALE: "Sale",
  REFUND: "Refund",
  CREDIT_RECEIVED: "Udhaar received",
  OPENING_BALANCE: "Old udhaar",
  CASH_OUT: "Cash out",
  EXPENSE: "Expense",
};

async function cashFlow(
  range: DateRange,
  filters: { type?: string; method?: string },
): Promise<ReportTable> {
  const type =
    filters.type && filters.type in TYPE_LABELS ? (filters.type as CashFlowType) : undefined;
  const method =
    filters.method && filters.method in METHOD_LABELS
      ? (filters.method as PaymentMethod)
      : undefined;
  const flows = await db.cashFlow.findMany({
    where: {
      createdAt: { gte: range.from, lt: range.to },
      ...(type ? { type } : {}),
      ...(method ? { method } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
    include: {
      sale: { select: { billNo: true } },
      saleReturn: { select: { returnNo: true } },
      customer: { select: { name: true } },
      user: { select: { name: true } },
    },
  });
  const rows = flows.map((f) => ({
    when: f.createdAt,
    type: TYPE_LABELS[f.type],
    method: METHOD_LABELS[f.method],
    reference: f.sale
      ? `Bill #${f.sale.billNo}`
      : f.saleReturn
        ? `Return #${f.saleReturn.returnNo}`
        : "",
    customer: f.customer?.name ?? "",
    note: f.note ?? "",
    by: f.user.name,
    amount: f.amount,
  }));
  return {
    title: "Cash flow",
    description: "Every money movement in the period. Money in is positive, money out negative.",
    columns: [
      { key: "when", label: "When", format: "datetime" },
      { key: "type", label: "Type", format: "text" },
      { key: "method", label: "Method", format: "text" },
      { key: "reference", label: "Reference", format: "text" },
      { key: "customer", label: "Customer", format: "text" },
      { key: "note", label: "Note", format: "text" },
      { key: "by", label: "By", format: "text" },
      { key: "amount", label: "Amount", format: "rs" },
    ],
    rows,
    // A grand total mixes money with udhaar, so only total one payment method at a time.
    totals: method
      ? { when: `Total (${METHOD_LABELS[method]})`, amount: sum(rows, "amount") }
      : undefined,
    note:
      flows.length === 5000
        ? "Showing the first 5,000 rows. Pick a shorter period."
        : method
          ? undefined
          : "Filter by one method to see its total (e.g. Cash for the drawer).",
  };
}

export const CASH_FLOW_FILTERS = {
  types: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label })),
  methods: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })),
};

export async function buildReport(
  key: ReportKey,
  range: DateRange,
  filters: { type?: string; method?: string } = {},
): Promise<ReportTable> {
  switch (key) {
    case "sales-by-product":
      return byProduct(range);
    case "sales-by-category":
      return byCategory(range);
    case "sales-by-payment":
      return byPayment(range);
    case "sales-by-staff":
      return byStaff(range);
    case "top-selling":
      return topSelling(range);
    case "slow-moving":
      return slowMoving(range);
    case "profit":
      return profit(range);
    case "current-stock":
      return stockTable(false);
    case "low-stock":
      return stockTable(true);
    case "cash-summary":
      return cashSummary(range);
    case "cash-flow":
      return cashFlow(range, filters);
  }
}

/** Formats a cell the same way on screen and in print. */
export function formatCell(value: ReportRow[string], format: ColumnFormat): string {
  if (value === null || value === undefined || value === "") return "";
  if (format === "datetime" && value instanceof Date) return formatDateTime(value);
  if (typeof value !== "number") return String(value);
  if (format === "rs")
    return `${value < 0 ? "-" : ""}Rs ${Math.abs(value).toLocaleString("en-US")}`;
  if (format === "pct") return `${value}%`;
  if (format === "qty")
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  return String(value);
}
