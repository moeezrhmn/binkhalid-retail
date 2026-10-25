"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Barcode, Plus, ScanLine, Trash2 } from "lucide-react";
import { searchLabelVariantsAction } from "@/app/(app)/(admin)/barcodes/actions";
import { saveSupplierAction, stockInAction } from "@/app/(app)/(admin)/inventory/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { normalizeCode } from "@/lib/codes";
import { formatQty } from "@/lib/format";
import { qtyToMilli } from "@/lib/money";
import { UNIT_LABELS } from "@/lib/units";
import type { LabelVariant } from "@/server/services/labels";

type Row = { variant: LabelVariant; qty: string; unitCost: string; updateCost: boolean };

export function StockInForm({
  suppliers: initialSuppliers,
}: {
  suppliers: { id: string; name: string }[];
}) {
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LabelVariant[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState<
    { variantId: string; code: string; qty: string }[] | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [searching, startSearch] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const add = (variant: LabelVariant) => {
    setReceived(null);
    setResults([]);
    setQ("");
    setMessage(null);
    setRows((list) => {
      if (list.some((row) => row.variant.id === variant.id)) return list;
      return [
        ...list,
        { variant, qty: "", unitCost: String(variant.costPrice), updateCost: false },
      ];
    });
    requestAnimationFrame(() => qtyRefs.current.get(variant.id)?.focus());
  };

  const search = (value: string) => {
    setQ(value);
    if (!value.trim()) return setResults([]);
    startSearch(async () => setResults(await searchLabelVariantsAction(value)));
  };

  const onEnter = () =>
    startSearch(async () => {
      const term = q.trim();
      if (!term) return;
      const found = await searchLabelVariantsAction(term);
      const pick =
        found.find((v) => v.code === normalizeCode(term)) ?? (found.length === 1 ? found[0] : null);
      if (pick) return add(pick);
      setResults(found);
      setMessage(found.length ? "Several matches: pick one below." : `Nothing matches "${term}".`);
    });

  const setRow = (id: string, change: Partial<Row>) =>
    setRows((list) => list.map((row) => (row.variant.id === id ? { ...row, ...change } : row)));

  const addSupplier = () => {
    const name = newSupplier?.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await saveSupplierAction({ name, phone: null, notes: null });
      if (!result.ok) return setError(result.error);
      setSuppliers((list) => [...list, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(result.data.id);
      setNewSupplier(null);
    });
  };

  const save = () => {
    setError(null);
    const missing = rows.find((row) => !row.qty.trim());
    if (rows.length === 0) return setError("Scan or search the items that arrived");
    if (missing) return setError(`Enter the quantity for ${missing.variant.code}`);
    startTransition(async () => {
      const result = await stockInAction({
        supplierId: supplierId || null,
        note: note.trim() || null,
        items: rows.map((row) => ({
          variantId: row.variant.id,
          qty: row.qty.trim(),
          unitCost: row.unitCost.trim() === "" ? null : Number(row.unitCost),
          updateCost: row.updateCost,
        })),
      });
      if (!result.ok) return setError(result.error);
      setReceived(result.data);
      setRows([]);
      setNote("");
      searchRef.current?.focus();
    });
  };

  const labelsHref = received
    ? `/barcodes?items=${received
        .map(
          (r) =>
            `${r.variantId}:${qtyToMilli(r.qty) % 1000 === 0 ? Math.min(Number(r.qty), 999) : 1}`,
        )
        .join(",")}`
    : "";

  return (
    <div className="space-y-3">
      {received ? (
        <Alert tone="success" className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Stock received for {received.length} item{received.length === 1 ? "" : "s"}.
          </span>
          <Link href={labelsHref} className={buttonClasses({ size: "sm" })}>
            <Barcode className="size-4" aria-hidden /> Print labels for this stock
          </Link>
        </Alert>
      ) : null}

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="supplier" className="block text-xs font-medium text-gray-600">
            Supplier <span className="font-normal text-gray-400">(optional)</span>
          </label>
          {newSupplier === null ? (
            <div className="flex gap-2">
              <Select
                id="supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">No supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={() => setNewSupplier("")}>
                <Plus className="size-4" aria-hidden /> New
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                id="supplier"
                autoFocus
                placeholder="Supplier name"
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSupplier();
                  }
                }}
              />
              <Button variant="secondary" onClick={addSupplier} disabled={pending}>
                Add
              </Button>
              <Button variant="ghost" onClick={() => setNewSupplier(null)}>
                Cancel
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="stock-note" className="block text-xs font-medium text-gray-600">
            Note <span className="font-normal text-gray-400">(optional, e.g. invoice number)</span>
          </label>
          <Input
            id="stock-note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            ref={searchRef}
            value={q}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEnter();
              }
            }}
            placeholder="Scan a label, or search by product name or code"
            aria-label="Find items"
            autoFocus
            className="pl-8"
          />
        </div>
        {message ? <p className="text-sm text-gray-600">{message}</p> : null}
        {results.length > 0 ? (
          <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
            {results.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
              >
                <span className="min-w-0">
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
        ) : searching && q ? (
          <p className="text-sm text-gray-400">Searching…</p>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH className="text-right">In stock</TH>
              <TH>Received</TH>
              <TH>Cost each (Rs)</TH>
              <TH>Set as cost price</TH>
              <TH className="w-10">
                <span className="sr-only">Remove</span>
              </TH>
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
                <TD className="text-right whitespace-nowrap text-gray-600">
                  {formatQty(row.variant.stockQty)} {UNIT_LABELS[row.variant.unit].toLowerCase()}
                </TD>
                <TD className="py-1.5">
                  <Input
                    ref={(el) => {
                      if (el) qtyRefs.current.set(row.variant.id, el);
                      else qtyRefs.current.delete(row.variant.id);
                    }}
                    aria-label={`Quantity received of ${row.variant.code}`}
                    inputMode="decimal"
                    value={row.qty}
                    onChange={(e) => setRow(row.variant.id, { qty: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchRef.current?.focus();
                      }
                    }}
                    className="h-8 w-24"
                  />
                </TD>
                <TD className="py-1.5">
                  <Input
                    aria-label={`Cost of ${row.variant.code}`}
                    inputMode="numeric"
                    value={row.unitCost}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d]/g, "");
                      setRow(row.variant.id, {
                        unitCost: value,
                        updateCost: value !== "" && Number(value) !== row.variant.costPrice,
                      });
                    }}
                    className="h-8 w-24"
                  />
                </TD>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Use as the new cost price of ${row.variant.code}`}
                    checked={row.updateCost}
                    onChange={(e) => setRow(row.variant.id, { updateCost: e.target.checked })}
                    className="size-4 accent-brand-700"
                  />
                </TD>
                <TD>
                  <button
                    type="button"
                    aria-label={`Remove ${row.variant.code}`}
                    onClick={() =>
                      setRows((list) => list.filter((r) => r.variant.id !== row.variant.id))
                    }
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TD>
              </TR>
            ))}
            {rows.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-8 text-center text-gray-500">
                  Scan or search the items that arrived. Enter after the quantity jumps back to the
                  scan box.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={pending || rows.length === 0}>
          {pending ? "Saving…" : `Receive stock (${rows.length})`}
        </Button>
      </div>
    </div>
  );
}
