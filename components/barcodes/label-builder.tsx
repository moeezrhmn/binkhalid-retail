"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarPlus, Plus, Printer, ScanLine, Trash2 } from "lucide-react";
import {
  labelVariantsAddedTodayAction,
  searchLabelVariantsAction,
} from "@/app/(app)/(admin)/barcodes/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { normalizeCode } from "@/lib/codes";
import { formatRs } from "@/lib/format";
import { MAX_LABEL_COPIES, MAX_LABEL_ITEMS } from "@/lib/labels";
import type { LabelVariant } from "@/server/services/labels";

type Item = { variant: LabelVariant; copies: string };

export function LabelBuilder({
  initial,
  labelSize,
}: {
  initial: { variant: LabelVariant; copies: number }[];
  labelSize: string;
}) {
  const [items, setItems] = useState<Item[]>(() =>
    initial.map(({ variant, copies }) => ({ variant, copies: String(copies) })),
  );
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LabelVariant[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [loadingToday, startToday] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const latestQuery = useRef("");

  const add = (variants: LabelVariant[], copiesFor: (v: LabelVariant) => number) =>
    setItems((list) => {
      const next = [...list];
      for (const variant of variants) {
        const index = next.findIndex((item) => item.variant.id === variant.id);
        if (index >= 0) {
          const copies = Number(next[index].copies || 0) + copiesFor(variant);
          next[index] = { ...next[index], copies: String(Math.min(copies, MAX_LABEL_COPIES)) };
        } else if (next.length < MAX_LABEL_ITEMS) {
          next.push({ variant, copies: String(copiesFor(variant)) });
        }
      }
      return next;
    });

  const addToday = () =>
    startToday(async () => {
      const variants = await labelVariantsAddedTodayAction();
      if (variants.length === 0) return setMessage("No products were added today.");
      setMessage(null);
      add(variants, (v) => v.suggestedCopies);
    });

  const search = (value: string) => {
    setQ(value);
    latestQuery.current = value;
    if (!value.trim()) return setResults([]);
    startSearch(async () => {
      const found = await searchLabelVariantsAction(value);
      if (latestQuery.current === value) setResults(found);
    });
  };

  // Enter adds an exact code match (a scanned label), or the only result.
  const onEnter = () =>
    startSearch(async () => {
      const term = q.trim();
      if (!term) return;
      const found = await searchLabelVariantsAction(term);
      const exact = found.find((v) => v.code === normalizeCode(term));
      const pick = exact ?? (found.length === 1 ? found[0] : null);
      if (!pick) {
        setResults(found);
        setMessage(
          found.length ? "Several matches: pick one below." : `Nothing matches "${term}".`,
        );
        return;
      }
      add([pick], () => 1);
      setMessage(null);
      setQ("");
      setResults([]);
      searchRef.current?.focus();
    });

  const totalLabels = items.reduce((sum, item) => sum + (Number(item.copies) || 0), 0);
  const printHref = `/print/labels?items=${items
    .filter((item) => Number(item.copies) > 0)
    .map((item) => `${item.variant.id}:${Math.min(Number(item.copies), MAX_LABEL_COPIES)}`)
    .join(",")}`;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-72">
            <ScanLine
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gray-400"
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
              aria-label="Find variants"
              autoFocus
              className="pl-10"
            />
          </div>
          <Button variant="secondary" onClick={addToday} disabled={loadingToday}>
            <CalendarPlus className="size-4" aria-hidden />
            {loadingToday ? "Loading…" : "Added today"}
          </Button>
        </div>
        {message ? <p className="text-sm text-gray-600">{message}</p> : null}
        {results.length > 0 ? (
          <ul className="max-h-72 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
            {results.map((variant) => (
              <li
                key={variant.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{variant.productName}</span>
                  {variant.variantText ? (
                    <span className="text-gray-500"> · {variant.variantText}</span>
                  ) : null}
                  <span className="ml-2 font-mono text-xs text-gray-400">{variant.code}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => add([variant], () => 1)}>
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
              <TH>Product</TH>
              <TH>Code</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">In stock</TH>
              <TH className="w-28">Copies</TH>
              <TH className="w-10">
                <span className="sr-only">Remove</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item.variant.id}>
                <TD>
                  <span className="font-medium">{item.variant.productName}</span>
                  {item.variant.variantText ? (
                    <span className="text-gray-500"> · {item.variant.variantText}</span>
                  ) : null}
                </TD>
                <TD className="font-mono text-xs">{item.variant.code}</TD>
                <TD className="text-right">{formatRs(item.variant.salePrice)}</TD>
                <TD className="text-right text-gray-500">{Number(item.variant.stockQty)}</TD>
                <TD className="py-2">
                  <Input
                    aria-label={`Copies of ${item.variant.code}`}
                    inputMode="numeric"
                    value={item.copies}
                    onChange={(e) =>
                      setItems((list) =>
                        list.map((i) =>
                          i.variant.id === item.variant.id
                            ? { ...i, copies: e.target.value.replace(/\D/g, "").slice(0, 3) }
                            : i,
                        ),
                      )
                    }
                    className="h-9 w-20"
                  />
                </TD>
                <TD>
                  <button
                    type="button"
                    aria-label={`Remove ${item.variant.code}`}
                    onClick={() =>
                      setItems((list) => list.filter((i) => i.variant.id !== item.variant.id))
                    }
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TD>
              </TR>
            ))}
            {items.length === 0 ? (
              <tr>
                <TD colSpan={6} className="py-10 text-center text-gray-500">
                  Scan or search above to add labels to print.
                </TD>
              </tr>
            ) : null}
          </TBody>
        </Table>
      </Card>

      {items.length >= MAX_LABEL_ITEMS ? (
        <Alert>
          At most {MAX_LABEL_ITEMS} different variants per print. Print these, then add more.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={totalLabels > 0 ? printHref : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={totalLabels === 0}
          className={
            totalLabels > 0
              ? "inline-flex h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800"
              : "inline-flex h-11 cursor-not-allowed items-center gap-2 rounded-lg bg-brand-700/50 px-4 text-sm font-medium text-white"
          }
        >
          <Printer className="size-4" aria-hidden /> Preview and print {totalLabels} label
          {totalLabels === 1 ? "" : "s"}
        </a>
        {items.length > 0 ? (
          <Button variant="ghost" onClick={() => setItems([])}>
            Clear all
          </Button>
        ) : null}
        <span className="text-xs text-gray-400">Label size {labelSize} (change in Settings)</span>
      </div>
    </div>
  );
}
