import "server-only";
import type { CashSession, PaymentMethod, Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { UserError } from "./errors";

type Tx = Prisma.TransactionClient;

const negate = (amount: number) => (amount === 0 ? 0 : -amount);

// Only one register session can be open. Session changes take a transaction
// advisory lock so two tabs cannot open or close at the same time.
const SESSION_LOCK = 4_310_001;

async function lockSessions(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SESSION_LOCK})`;
}

export async function currentSession() {
  return db.cashSession.findFirst({ where: { closedAt: null }, orderBy: { openedAt: "desc" } });
}

export async function openSession(openingCash: number, note?: string | null) {
  if (!Number.isInteger(openingCash) || openingCash < 0) {
    throw new UserError("Opening cash must be whole rupees, 0 or more");
  }
  return db.$transaction(async (tx) => {
    await lockSessions(tx);
    const open = await tx.cashSession.findFirst({ where: { closedAt: null } });
    if (open) throw new UserError("The day is already open");
    return tx.cashSession.create({ data: { openingCash, note: note?.trim() || null } });
  });
}

export async function recordDrawerOut(input: {
  type: "CASH_OUT" | "EXPENSE";
  amount: number;
  note: string;
  userId: string;
}) {
  const note = input.note.trim();
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new UserError("Enter an amount in whole rupees above 0");
  }
  if (!note) throw new UserError("Add a note saying what the money was for");
  return db.cashFlow.create({
    data: {
      type: input.type,
      method: "CASH",
      amount: -input.amount,
      note: note.slice(0, 200),
      userId: input.userId,
    },
  });
}

export type SessionSummary = {
  openingCash: number;
  cashSales: number;
  creditReceivedCash: number;
  cashRefunds: number;
  cashOut: number;
  expenses: number;
  expectedCash: number;
  /** Money that did not go through the drawer, by method (sales minus refunds). */
  otherMethods: Partial<Record<PaymentMethod, number>>;
  creditGiven: number;
  billCount: number;
};

/**
 * What should be in the drawer: opening cash plus every CASH row since the day
 * was opened (up to closing time once closed). Times come from the database
 * clock, so a row saved a moment ago is never missed.
 */
export async function summarize(session: CashSession, until: Date | null = session.closedAt) {
  const window = { gte: session.openedAt, ...(until ? { lte: until } : {}) };
  const rows = await db.cashFlow.groupBy({
    by: ["type", "method"],
    where: { createdAt: window },
    _sum: { amount: true },
  });
  const sum = (type: string, method?: string) =>
    rows
      .filter((row) => row.type === type && (!method || row.method === method))
      .reduce((total, row) => total + (row._sum.amount ?? 0), 0);

  const cashRows = rows.filter((row) => row.method === "CASH");
  const cashMovement = cashRows.reduce((total, row) => total + (row._sum.amount ?? 0), 0);

  const otherMethods: SessionSummary["otherMethods"] = {};
  for (const row of rows) {
    if (row.method === "CASH" || row.method === "CREDIT" || row.method === "EXCHANGE") continue;
    if (row.type !== "SALE" && row.type !== "REFUND" && row.type !== "CREDIT_RECEIVED") continue;
    otherMethods[row.method] = (otherMethods[row.method] ?? 0) + (row._sum.amount ?? 0);
  }

  const billCount = await db.sale.count({ where: { status: "COMPLETED", completedAt: window } });

  return {
    openingCash: session.openingCash,
    cashSales: sum("SALE", "CASH"),
    creditReceivedCash: sum("CREDIT_RECEIVED", "CASH"),
    cashRefunds: negate(sum("REFUND", "CASH")),
    cashOut: negate(sum("CASH_OUT")),
    expenses: negate(sum("EXPENSE")),
    expectedCash: session.openingCash + cashMovement,
    otherMethods,
    creditGiven: sum("SALE", "CREDIT"),
    billCount,
  } satisfies SessionSummary;
}

export async function closeSession(countedCash: number, note?: string | null) {
  if (!Number.isInteger(countedCash) || countedCash < 0) {
    throw new UserError("Counted cash must be whole rupees, 0 or more");
  }
  return db.$transaction(async (tx) => {
    await lockSessions(tx);
    const open = await tx.cashSession.findFirst({ where: { closedAt: null } });
    if (!open) throw new UserError("The day is not open");
    const [{ now: closedAt }] = await tx.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    const summary = await summarize(open, closedAt);
    return tx.cashSession.update({
      where: { id: open.id },
      data: {
        closedAt,
        expectedCash: summary.expectedCash,
        countedCash,
        note: [open.note, note?.trim()].filter(Boolean).join(" | ") || null,
      },
    });
  });
}

export async function listSessions(take = 30) {
  return db.cashSession.findMany({ orderBy: { openedAt: "desc" }, take });
}

export async function listDrawerOuts(session: CashSession) {
  return db.cashFlow.findMany({
    where: {
      type: { in: ["CASH_OUT", "EXPENSE"] },
      createdAt: { gte: session.openedAt, ...(session.closedAt ? { lte: session.closedAt } : {}) },
    },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
}
