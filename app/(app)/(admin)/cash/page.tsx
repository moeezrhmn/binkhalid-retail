import type { Metadata } from "next";
import Link from "next/link";
import { CashSummary } from "@/components/cash/cash-summary";
import { CloseDayForm, DrawerOutForm, OpenDayForm } from "@/components/cash/register-forms";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatRs } from "@/lib/format";
import { currentSession, listDrawerOuts, listSessions, summarize } from "@/server/services/cash";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Cash Register" };

export default async function CashPage() {
  await requireAdmin();
  const [session, sessions] = await Promise.all([currentSession(), listSessions()]);
  const [summary, outs] = session
    ? await Promise.all([summarize(session), listDrawerOuts(session)])
    : [null, []];
  const past = sessions.filter((s) => s.closedAt);

  return (
    <>
      <PageHeader
        title="Cash Register"
        description="Open the day, record cash taken out, and close with a count."
      />
      <div className="space-y-3">
        {!session ? (
          <Card className="space-y-2 p-4">
            <h2 className="text-sm font-semibold text-gray-900">The day is not open</h2>
            <p className="text-sm text-gray-500">
              Count the cash in the drawer before the first sale and enter it here.
            </p>
            <OpenDayForm />
          </Card>
        ) : (
          <>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Today <Badge tone="green">Open since {formatDateTime(session.openedAt)}</Badge>
                </h2>
                <span className="text-xs text-gray-400">Updates with every sale</span>
              </div>
              <CashSummary summary={summary!} />
            </Card>

            <Card className="space-y-2 p-4">
              <h2 className="text-sm font-semibold text-gray-900">Cash out and expenses</h2>
              <DrawerOutForm />
              {outs.length ? (
                <Table>
                  <THead>
                    <tr>
                      <TH>Time</TH>
                      <TH>Type</TH>
                      <TH>Note</TH>
                      <TH>By</TH>
                      <TH className="text-right">Amount</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {outs.map((out) => (
                      <TR key={out.id}>
                        <TD className="text-xs whitespace-nowrap">
                          {formatDateTime(out.createdAt)}
                        </TD>
                        <TD>{out.type === "EXPENSE" ? "Expense" : "Cash out"}</TD>
                        <TD>{out.note}</TD>
                        <TD className="text-gray-600">{out.user.name}</TD>
                        <TD className="text-right">{formatRs(-out.amount)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : null}
            </Card>

            <Card className="space-y-2 p-4">
              <h2 className="text-sm font-semibold text-gray-900">Close the day</h2>
              <p className="text-sm text-gray-500">
                Count the drawer. Expected: <strong>{formatRs(summary!.expectedCash)}</strong>
              </p>
              <CloseDayForm expectedCash={summary!.expectedCash} />
            </Card>
          </>
        )}

        <Card>
          <div className="px-4 pt-3 text-sm font-semibold text-gray-900">Past days</div>
          <Table>
            <THead>
              <tr>
                <TH>Opened</TH>
                <TH>Closed</TH>
                <TH className="text-right">Opening</TH>
                <TH className="text-right">Expected</TH>
                <TH className="text-right">Counted</TH>
                <TH className="text-right">Difference</TH>
              </tr>
            </THead>
            <TBody>
              {past.map((s) => {
                const diff = (s.countedCash ?? 0) - (s.expectedCash ?? 0);
                return (
                  <TR key={s.id}>
                    <TD>
                      <Link href={`/cash/${s.id}`} className="text-brand-700 hover:underline">
                        {formatDateTime(s.openedAt)}
                      </Link>
                    </TD>
                    <TD className="text-gray-600">{formatDateTime(s.closedAt!)}</TD>
                    <TD className="text-right">{formatRs(s.openingCash)}</TD>
                    <TD className="text-right">{formatRs(s.expectedCash ?? 0)}</TD>
                    <TD className="text-right">{formatRs(s.countedCash ?? 0)}</TD>
                    <TD
                      className={
                        diff === 0
                          ? "text-right text-brand-700"
                          : "text-right font-semibold text-red-600"
                      }
                    >
                      {diff === 0
                        ? "Matches"
                        : diff > 0
                          ? `+${formatRs(diff)}`
                          : `−${formatRs(-diff)}`}
                    </TD>
                  </TR>
                );
              })}
              {past.length === 0 ? (
                <tr>
                  <TD colSpan={6} className="py-6 text-center text-gray-500">
                    No closed days yet.
                  </TD>
                </tr>
              ) : null}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
