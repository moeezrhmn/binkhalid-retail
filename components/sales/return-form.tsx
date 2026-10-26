"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Undo2 } from "lucide-react";
import { createReturnAction } from "@/app/(app)/(admin)/sales/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { METHOD_LABELS, PAYMENT_METHODS, type SalePaymentMethod } from "@/lib/cart";
import { formatQty, formatRs } from "@/lib/format";
import { qtyToMilli, roundDiv } from "@/lib/money";
import { validateQty, type UnitCode } from "@/lib/units";

type Item = {
  id: string;
  name: string;
  code: string;
  unit: UnitCode;
  qty: string;
  netTotal: number;
  returnableQty: string;
};

export function ReturnForm({
  sale,
  dayOpen,
}: {
  /** Refunds need an open register day. */
  dayOpen: boolean;
  sale: {
    id: string;
    billNo: number;
    customerName: string;
    defaultMethod: SalePaymentMethod;
    items: Item[];
  };
}) {
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    Object.fromEntries(sale.items.map((item) => [item.id, { qty: "", restock: true }])),
  );
  const [method, setMethod] = useState<SalePaymentMethod>(sale.defaultMethod);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const picked = sale.items.flatMap((item) => {
    const row = rows[item.id];
    if (!row.qty.trim()) return [];
    const problem =
      validateQty(item.unit, row.qty) ??
      (qtyToMilli(row.qty) > qtyToMilli(item.returnableQty)
        ? `Only ${formatQty(item.returnableQty)} can be returned`
        : null);
    const amount = problem
      ? 0
      : roundDiv(item.netTotal * qtyToMilli(row.qty), qtyToMilli(item.qty));
    return [{ item, qty: row.qty.trim(), restock: row.restock, problem, amount }];
  });
  const refund = picked.reduce((sum, p) => sum + p.amount, 0);
  const invalid = picked.find((p) => p.problem);

  const refundNow = () => {
    setError(null);
    if (picked.length === 0) return setError("Enter how many of each item come back");
    if (invalid) return setError(`${invalid.item.name}: ${invalid.problem}`);
    startTransition(async () => {
      const result = await createReturnAction({
        originalSaleId: sale.id,
        items: picked.map((p) => ({ saleItemId: p.item.id, qty: p.qty, restock: p.restock })),
        refunds: refund > 0 ? [{ method, amount: refund }] : [],
      });
      if (!result.ok) return setError(result.error);
      router.push(`/sales/${sale.id}`);
    });
  };

  const exchangeHref = `/pos?exchange=${sale.id}&items=${picked
    .map((p) => `${p.item.id}:${p.qty}:${p.restock ? 1 : 0}`)
    .join(",")}`;

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <h2 className="text-base font-semibold text-gray-900">Return from bill #{sale.billNo}</h2>
        <p className="text-sm text-gray-500">
          {sale.customerName}. Each refund is what the customer actually paid for the item, after
          discounts.
        </p>
      </Card>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH className="text-right">Sold</TH>
              <TH className="text-right">Can return</TH>
              <TH>Returning</TH>
              <TH>Back on shelf</TH>
              <TH className="text-right">Refund</TH>
            </tr>
          </THead>
          <TBody>
            {sale.items.map((item) => {
              const row = rows[item.id];
              const pick = picked.find((p) => p.item.id === item.id);
              const none = Number(item.returnableQty) <= 0;
              return (
                <TR key={item.id} className={none ? "opacity-50" : undefined}>
                  <TD>
                    <div className="font-medium">{item.name}</div>
                    <div className="font-mono text-xs text-gray-400">{item.code}</div>
                  </TD>
                  <TD className="text-right">{formatQty(item.qty)}</TD>
                  <TD className="text-right">{formatQty(item.returnableQty)}</TD>
                  <TD className="py-1.5">
                    <Input
                      aria-label={`Quantity of ${item.code} returned`}
                      inputMode="decimal"
                      disabled={none}
                      value={row.qty}
                      placeholder="0"
                      onChange={(e) =>
                        setRows({ ...rows, [item.id]: { ...row, qty: e.target.value } })
                      }
                      aria-invalid={pick?.problem ? true : undefined}
                      className="h-8 w-20"
                    />
                    {pick?.problem ? (
                      <p className="mt-0.5 text-xs text-red-600">{pick.problem}</p>
                    ) : null}
                  </TD>
                  <TD>
                    <label className="inline-flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={row.restock}
                        disabled={none}
                        onChange={(e) =>
                          setRows({ ...rows, [item.id]: { ...row, restock: e.target.checked } })
                        }
                        className="size-4 accent-brand-700"
                      />
                      {row.restock ? "Yes" : "No (damaged)"}
                    </label>
                  </TD>
                  <TD className="text-right font-semibold">{pick ? formatRs(pick.amount) : "—"}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-3 p-4">
        <div>
          <p className="text-sm text-gray-600">Refund total</p>
          <p className="text-2xl font-bold text-gray-900">{formatRs(refund)}</p>
        </div>
        <div className="w-48 space-y-1">
          <label htmlFor="refund-method" className="block text-xs font-medium text-gray-600">
            Refund by
          </label>
          <Select
            id="refund-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as SalePaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m === "CREDIT" ? "Lower the udhaar balance" : METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {!dayOpen ? (
        <Alert tone="error">
          The day is closed. Open it in Cash Register before taking a return or giving a refund.
        </Alert>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={refundNow} disabled={pending || picked.length === 0 || !dayOpen}>
          <Undo2 className="size-4" aria-hidden />{" "}
          {pending ? "Saving…" : `Return and refund ${formatRs(refund)}`}
        </Button>
        {picked.length > 0 && !invalid ? (
          <Link href={exchangeHref} className={buttonClasses({ variant: "secondary" })}>
            <ArrowRightLeft className="size-4" aria-hidden /> Exchange for other items instead
          </Link>
        ) : null}
        <Link href={`/sales/${sale.id}`} className={buttonClasses({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </div>
  );
}
