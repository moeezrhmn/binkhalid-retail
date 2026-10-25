import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CashSummary } from "@/components/cash/cash-summary";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime, formatRs } from "@/lib/format";
import { listDrawerOuts, summarize } from "@/server/services/cash";

export const metadata: Metadata = { title: "Cash day" };

export default async function CashDayPage({ params }: PageProps<"/cash/[id]">) {
  const { id } = await params;
  const session = /^[0-9a-f-]{36}$/.test(id)
    ? await db.cashSession.findUnique({ where: { id } })
    : null;
  if (!session) notFound();
  const [summary, outs] = await Promise.all([summarize(session), listDrawerOuts(session)]);

  return (
    <>
      <PageHeader
        title="Cash register day"
        description={`${formatDateTime(session.openedAt)} to ${session.closedAt ? formatDateTime(session.closedAt) : "now (still open)"}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            <Link href="/cash" className={buttonClasses({ variant: "secondary" })}>
              Back
            </Link>
          </div>
        }
      />
      <div className="space-y-3">
        <Card className="p-4">
          <CashSummary summary={summary} counted={session.countedCash} />
        </Card>
        {outs.length ? (
          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold text-gray-900">Cash out and expenses</h2>
            {outs.map((out) => (
              <div key={out.id} className="flex justify-between border-b border-gray-100 py-1">
                <span>
                  {out.type === "EXPENSE" ? "Expense" : "Cash out"}: {out.note}{" "}
                  <span className="text-gray-400">({formatDateTime(out.createdAt)})</span>
                </span>
                <span>{formatRs(-out.amount)}</span>
              </div>
            ))}
          </Card>
        ) : null}
        {session.note ? <p className="text-sm text-gray-600">Note: {session.note}</p> : null}
      </div>
    </>
  );
}
