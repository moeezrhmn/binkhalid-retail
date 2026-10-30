"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { quickAddAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { UNIT_LABELS } from "@/lib/units";
import { cleanValues } from "@/lib/variants";
import type { FormCategory } from "./product-form";
import { useConfirm } from "@/components/ui/confirm";

type Row = {
  key: string;
  name: string;
  values: Record<string, string>;
  costPrice: string;
  salePrice: string;
  openingStock: string;
  minStock: string;
  error?: string;
};

let counter = 0;
const rowKey = () => `r${++counter}`;

function emptyRow(copyFrom?: Row): Row {
  return {
    key: rowKey(),
    name: "",
    values: copyFrom ? { ...copyFrom.values } : {},
    costPrice: copyFrom?.costPrice ?? "",
    salePrice: copyFrom?.salePrice ?? "",
    openingStock: copyFrom?.openingStock ?? "",
    minStock: copyFrom?.minStock ?? "",
  };
}

const isBlank = (row: Row) => !row.name.trim() && !row.salePrice.trim() && !row.costPrice.trim();

export function QuickAddGrid({
  categories,
  initialCategoryId,
}: {
  categories: FormCategory[];
  initialCategoryId?: string;
}) {
  const confirm = useConfirm();
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.id === initialCategoryId)?.id ?? categories[0]?.id ?? "",
  );
  const category = categories.find((c) => c.id === categoryId);
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [saved, setSaved] = useState<{ name: string; code: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (focusKey) nameInputs.current.get(focusKey)?.focus();
  }, [focusKey]);

  if (!category) {
    return <Alert>Create an active category first.</Alert>;
  }

  const setRow = (key: string, change: Partial<Row>) =>
    setRows((list) =>
      list.map((row) => (row.key === key ? { ...row, ...change, error: undefined } : row)),
    );

  const onEnter = (index: number) => {
    if (index === rows.length - 1) {
      const row = emptyRow(rows[index]);
      setRows((list) => [...list, row]);
      setFocusKey(row.key);
    } else {
      setFocusKey(rows[index + 1].key);
    }
  };

  const changeCategory = async (id: string) => {
    if (
      rows.some((row) => !isBlank(row)) &&
      !(await confirm({
        title: "Change the category?",
        message: "The rows you have typed are cleared.",
        confirmLabel: "Change category",
        tone: "danger",
      }))
    ) {
      return;
    }
    setCategoryId(id);
    const row = emptyRow();
    setRows([row]);
    setFocusKey(row.key);
  };

  const saveAll = () => {
    setError(null);
    const filled = rows.filter((row) => !isBlank(row));
    if (filled.length === 0) return setError("Fill in at least one row");

    // Rows without a name or price are flagged and kept; every other row is saved.
    const problem = (row: Row) =>
      !row.name.trim() ? "Enter a name" : !row.salePrice.trim() ? "Enter a sale price" : null;
    const flagged = new Map(
      filled.flatMap((row) => (problem(row) ? [[row.key, problem(row)!]] : [])),
    );
    const toSave = filled.filter((row) => !flagged.has(row.key));
    if (toSave.length === 0) {
      setRows((list) => list.map((row) => ({ ...row, error: flagged.get(row.key) })));
      return;
    }

    startTransition(async () => {
      const result = await quickAddAction(
        categoryId,
        toSave.map((row) => ({
          key: row.key,
          name: row.name,
          values: cleanValues(row.values),
          costPrice: row.costPrice.trim() || "0",
          salePrice: row.salePrice,
          openingStock: row.openingStock.trim() || "0",
          minStock: row.minStock.trim() || "0",
        })),
      );
      if (!result.ok) return setError(result.error);

      const byKey = new Map(result.data.map((r) => [r.key, r]));
      const done = toSave.filter((row) => byKey.get(row.key)?.ok);
      setSaved((list) => [
        ...done.map((row) => ({ name: row.name, code: byKey.get(row.key)!.code! })),
        ...list,
      ]);
      const remaining = rows
        .filter((row) => !byKey.get(row.key)?.ok && !isBlank(row))
        .map((row) => ({ ...row, error: flagged.get(row.key) ?? byKey.get(row.key)?.error }));
      const last = rows[rows.length - 1];
      const next = remaining.length ? remaining : [emptyRow(last)];
      setRows(next);
      setFocusKey(next[0].key);
    });
  };

  const inputClass = "h-8";

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="w-64 space-y-1">
          <label htmlFor="qa-category" className="block text-xs font-medium text-gray-600">
            Category
          </label>
          <Select
            id="qa-category"
            value={categoryId}
            onChange={(e) => changeCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.codePrefix})
              </option>
            ))}
          </Select>
        </div>
        <p className="max-w-xl text-sm text-gray-500">
          One row per product with a single variant, sold by{" "}
          {UNIT_LABELS[category.defaultUnit].toLowerCase()}. Press{" "}
          <kbd className="rounded border px-1">Tab</kbd> to move between cells and{" "}
          <kbd className="rounded border px-1">Enter</kbd> for a new row, which copies everything
          except the name. For products with many sizes or colors, use{" "}
          <Link href={`/products/new?category=${categoryId}`} className="text-brand-700 underline">
            New product
          </Link>
          .
        </p>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <TH className="w-8">#</TH>
              <TH className="min-w-56">Name</TH>
              {category.attributes.map((attribute) => (
                <TH key={attribute.name} className="min-w-32">
                  {attribute.name}
                </TH>
              ))}
              <TH>Cost (Rs)</TH>
              <TH>Price (Rs)</TH>
              <TH>Opening stock</TH>
              <TH>Min stock</TH>
              <TH className="w-10">
                <span className="sr-only">Remove</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row, index) => (
              <tr
                key={row.key}
                className={cn(row.error && "bg-red-50")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !(e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    onEnter(index);
                  }
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    saveAll();
                  }
                }}
              >
                <TD className="text-gray-400">{index + 1}</TD>
                <TD className="py-2">
                  <Input
                    ref={(el) => {
                      if (el) nameInputs.current.set(row.key, el);
                      else nameInputs.current.delete(row.key);
                    }}
                    aria-label={`Row ${index + 1} name`}
                    value={row.name}
                    onChange={(e) => setRow(row.key, { name: e.target.value })}
                    className={inputClass}
                    autoFocus={index === 0}
                  />
                  {row.error ? <p className="mt-1 text-xs text-red-600">{row.error}</p> : null}
                </TD>
                {category.attributes.map((attribute) => (
                  <TD key={attribute.name} className="py-2">
                    {attribute.type === "OPTION" ? (
                      <Select
                        aria-label={`Row ${index + 1} ${attribute.name}`}
                        value={row.values[attribute.name] ?? ""}
                        onChange={(e) =>
                          setRow(row.key, {
                            values: { ...row.values, [attribute.name]: e.target.value },
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">—</option>
                        {attribute.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.value}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        aria-label={`Row ${index + 1} ${attribute.name}`}
                        value={row.values[attribute.name] ?? ""}
                        onChange={(e) =>
                          setRow(row.key, {
                            values: { ...row.values, [attribute.name]: e.target.value },
                          })
                        }
                        className={inputClass}
                      />
                    )}
                  </TD>
                ))}
                {(["costPrice", "salePrice", "openingStock", "minStock"] as const).map((field) => (
                  <TD key={field} className="py-2">
                    <Input
                      aria-label={`Row ${index + 1} ${field}`}
                      inputMode="decimal"
                      value={row[field]}
                      onChange={(e) => setRow(row.key, { [field]: e.target.value })}
                      className={cn(inputClass, "w-24")}
                    />
                  </TD>
                ))}
                <TD>
                  <button
                    type="button"
                    aria-label={`Remove row ${index + 1}`}
                    tabIndex={-1}
                    onClick={() =>
                      setRows((list) =>
                        list.length > 1 ? list.filter((r) => r.key !== row.key) : [emptyRow()],
                      )
                    }
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </TD>
              </tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={saveAll} disabled={pending}>
          {pending ? "Saving…" : `Save all (${rows.filter((r) => !isBlank(r)).length})`}
        </Button>
        <Button variant="secondary" onClick={() => onEnter(rows.length - 1)}>
          <Plus className="size-4" aria-hidden /> Add row
        </Button>
        <span className="text-xs text-gray-400">Ctrl + Enter saves all</span>
      </div>

      {saved.length > 0 ? (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Saved this session ({saved.length})
            </h2>
            <Link href="/barcodes?today=1" className="text-sm text-brand-700 underline">
              Print labels for today&apos;s products
            </Link>
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {saved.map((item) => (
              <li
                key={item.code}
                className="flex justify-between gap-3 border-b border-gray-100 py-1"
              >
                <span>{item.name}</span>
                <span className="font-mono text-xs text-gray-500">{item.code}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
