import { METHOD_LABELS } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatRs } from "@/lib/format";
import type { SessionSummary } from "@/server/services/cash";

/** The drawer breakdown: what came in, what went out, and what should be there. */
export function CashSummary({
  summary,
  counted,
}: {
  summary: SessionSummary;
  counted?: number | null;
}) {
  const rows: [string, number, "+" | "−"][] = [
    ["Opening cash", summary.openingCash, "+"],
    ["Cash sales", summary.cashSales, "+"],
    ["Udhaar received in cash", summary.creditReceivedCash, "+"],
    ["Cash refunds", summary.cashRefunds, "−"],
    ["Cash out", summary.cashOut, "−"],
    ["Expenses", summary.expenses, "−"],
  ];
  const difference =
    counted !== undefined && counted !== null ? counted - summary.expectedCash : null;
  const others = Object.entries(summary.otherMethods).filter(([, amount]) => amount !== 0);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <dl className="space-y-1 text-sm">
        {rows.map(([label, amount, sign]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-gray-600">{label}</dt>
            <dd className={cn(sign === "−" && amount > 0 && "text-red-600")}>
              {sign === "−" && amount > 0 ? "− " : ""}
              {formatRs(amount)}
            </dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-gray-200 pt-1 text-base font-semibold">
          <dt>Expected in drawer</dt>
          <dd>{formatRs(summary.expectedCash)}</dd>
        </div>
        {difference !== null ? (
          <>
            <div className="flex justify-between">
              <dt className="text-gray-600">Counted</dt>
              <dd>{formatRs(counted!)}</dd>
            </div>
            <div
              className={cn(
                "flex justify-between font-semibold",
                difference === 0 ? "text-brand-700" : "text-red-600",
              )}
            >
              <dt>Difference</dt>
              <dd>
                {difference === 0
                  ? "Matches"
                  : difference > 0
                    ? `${formatRs(difference)} over`
                    : `${formatRs(-difference)} short`}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-gray-600">Bills</dt>
          <dd>{summary.billCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-gray-600">Udhaar given</dt>
          <dd>{formatRs(summary.creditGiven)}</dd>
        </div>
        {others.length ? (
          others.map(([method, amount]) => (
            <div key={method} className="flex justify-between">
              <dt className="text-gray-600">
                {METHOD_LABELS[method as keyof typeof METHOD_LABELS] ?? method}
              </dt>
              <dd>{formatRs(amount)}</dd>
            </div>
          ))
        ) : (
          <p className="text-gray-500">No card, bank or wallet payments.</p>
        )}
        <p className="pt-1 text-xs text-gray-400">These did not go through the cash drawer.</p>
      </dl>
    </div>
  );
}
