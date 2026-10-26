"use client";

import { useState, useTransition } from "react";
import { Plus, ScanLine, Trash2 } from "lucide-react";
import { searchLabelVariantsAction } from "@/app/(app)/(admin)/barcodes/actions";
import { createReturnAction } from "@/app/(app)/(admin)/sales/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { METHOD_LABELS, PAYMENT_METHODS, priceLine, type SalePaymentMethod } from "@/lib/cart";
import { normalizeCode } from "@/lib/codes";
import { formatRs } from "@/lib/format";
import { validateQty } from "@/lib/units";
import type { LabelVariant } from "@/server/services/labels";

type Row = {
  variant: LabelVariant;
  qty: string;
  amount: string;
  amountEdited: boolean;
  restock: boolean;
};

const METHODS = PAYMENT_METHODS.filter((m) => m !== "CREDIT");

export function NoBillReturn({ dayOpen }: { dayOpen: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LabelVariant[]>([]);
  const [method, setMethod] = useState<SalePaymentMethod>("CASH");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const suggested = (variant: LabelVariant, qty: string) => {
    if (validateQty(variant.unit, qty)) return "";
    return String(priceLine(variant.salePrice, qty, 0).lineTotal);
  };

  const add = (variant: LabelVariant) => {
    setResults([]);
    setQ("");
    setMessage(null);
    if (rows.some((row) => row.variant.id === variant.id)) return;
    setRows([
      ...rows,
      { variant, qty: "1", amount: suggested(variant, "1"), amountEdited: false, restock: true },
    ]);
  };

  const find = (enter: boolean) =>
    startTransition(async () => {
      const term = q.trim();
      if (!term) return setResults([]);
      const found = await searchLabelVariantsAction(term);
      const exact = found.find((v) => v.code === normalizeCode(term));
      if (enter && (exact || found.length === 1)) return add(exact ?? found[0]);
      setResults(found);
    });

  const setRow = (id: string, change: Partial<Row>) =>
    setRows((list) =>
      list.map((row) => {
        if (row.variant.id !== id) return row;
        const next = { ...row, ...change };
        if ("qty" in change && !row.amountEdited) next.amount = suggested(row.variant, next.qty);
        return next;
      }),
    );

  const total = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const save = () => {
    setMessage(null);
    const bad = rows.find((row) => validateQty(row.variant.unit, row.qty) || row.amount === "");
    if (rows.length === 0)
      return setMessage({ tone: "error", text: "Scan or search the returned items" });
    if (bad)
      return setMessage({
        tone: "error",
        text: `Check the quantity and amount for ${bad.variant.code}`,
      });
    startTransition(async () => {
      const result = await createReturnAction({
        originalSaleId: null,
        items: rows.map((row) => ({
          variantId: row.variant.id,
          qty: row.qty.trim(),
          restock: row.restock,
          amount: Number(row.amount),
        })),
        refunds: total > 0 ? [{ method, amount: total }] : [],
      });
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setRows([]);
      setMessage({
        tone: "success",
        text: `Return #${result.data.returnNo} saved. Refunded ${formatRs(result.data.refundAmount)}.`,
      });
    });
  };

  return (
    <div className="space-y-3">
      {!dayOpen ? (
        <Alert tone="error">
          The day is closed. Open it in Cash Register before taking a return or giving a refund.
        </Alert>
      ) : null}
      <Alert>
        Use this only when the customer has no bill. With a bill, open it from{" "}
        <strong>Bills</strong> so the refund matches what was paid.
      </Alert>
      <Card className="space-y-2 p-4">
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim().length >= 2) find(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), find(true))}
            placeholder="Scan the label, or search by name or code"
            aria-label="Find the returned item"
            autoFocus
            className="pl-8"
          />
        </div>
        {results.length > 0 ? (
          <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {results.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
              >
                <span>
                  <span className="font-medium">{v.productName}</span>
                  {v.variantText ? <span className="text-gray-500"> · {v.variantText}</span> : null}
                  <span className="ml-2 font-mono text-xs text-gray-400">{v.code}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => add(v)}>
                  <Plus className="size-4" aria-hidden /> Add
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH>Qty</TH>
              <TH>Give back (Rs)</TH>
              <TH>Back on shelf</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.variant.id}>
                <TD>
                  <span className="font-medium">{row.variant.productName}</span>
                  {row.variant.variantText ? (
                    <span className="text-gray-500"> · {row.variant.variantText}</span>
                  ) : null}
                  <span className="ml-2 font-mono text-xs text-gray-400">{row.variant.code}</span>
                </TD>
                <TD className="py-1.5">
                  <Input
                    aria-label={`Quantity of ${row.variant.code}`}
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => setRow(row.variant.id, { qty: e.target.value })}
                    className="h-8 w-20"
                  />
                </TD>
                <TD className="py-1.5">
                  <Input
                    aria-label={`Amount for ${row.variant.code}`}
                    inputMode="numeric"
                    value={row.amount}
                    onChange={(e) =>
                      setRow(row.variant.id, {
                        amount: e.target.value.replace(/[^\d]/g, ""),
                        amountEdited: true,
                      })
                    }
                    className="h-8 w-28"
                  />
                </TD>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Put ${row.variant.code} back on the shelf`}
                    checked={row.restock}
                    onChange={(e) => setRow(row.variant.id, { restock: e.target.checked })}
                    className="size-4 accent-brand-700"
                  />
                </TD>
                <TD>
                  <button
                    type="button"
                    aria-label={`Remove ${row.variant.code}`}
                    onClick={() => setRows(rows.filter((r) => r.variant.id !== row.variant.id))}
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TD>
              </TR>
            ))}
            {rows.length === 0 ? (
              <tr>
                <TD colSpan={5} className="py-8 text-center text-gray-500">
                  No items yet.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44 space-y-1">
          <label htmlFor="nobill-method" className="block text-xs font-medium text-gray-600">
            Refund by
          </label>
          <Select
            id="nobill-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as SalePaymentMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={save} disabled={pending || rows.length === 0 || !dayOpen}>
          {pending ? "Saving…" : `Save return and refund ${formatRs(total)}`}
        </Button>
      </div>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </div>
  );
}
