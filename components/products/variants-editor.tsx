"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateVariantsAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatQty, formatRs } from "@/lib/format";

export type EditorVariant = {
  id: string;
  code: string;
  label: string;
  costPrice: number;
  salePrice: number;
  stockQty: string;
  minStock: string;
  isActive: boolean;
  isLow: boolean;
};

type Draft = { costPrice: string; salePrice: string; minStock: string; isActive: boolean };

export function VariantsEditor({
  productId,
  variants,
  highlightId,
  unitLabel,
}: {
  productId: string;
  variants: EditorVariant[];
  highlightId?: string;
  unitLabel: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startEditing = () => {
    setDrafts(
      Object.fromEntries(
        variants.map((v) => [
          v.id,
          {
            costPrice: String(v.costPrice),
            salePrice: String(v.salePrice),
            minStock: formatQty(v.minStock),
            isActive: v.isActive,
          },
        ]),
      ),
    );
    setError(null);
    setEditing(true);
  };

  const set = (id: string, change: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [id]: { ...all[id], ...change } }));

  const save = () => {
    setError(null);
    const rows = variants.map((v) => ({ id: v.id, ...drafts[v.id] }));
    startTransition(async () => {
      const result = await updateVariantsAction(productId, rows);
      if (!result.ok) return setError(result.error);
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Variants ({variants.length})</h2>
        {editing ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={startEditing}>
            <Pencil className="size-4" aria-hidden /> Edit prices
          </Button>
        )}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Variant</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Stock</TH>
              <TH className="text-right">Min</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {variants.map((v) => {
              const draft = drafts[v.id];
              return (
                <TR key={v.id} className={cn(v.id === highlightId && "bg-gold-300/20")}>
                  <TD className="font-mono text-xs whitespace-nowrap">{v.code}</TD>
                  <TD className="whitespace-nowrap">{v.label || "—"}</TD>
                  {(["costPrice", "salePrice"] as const).map((field) => (
                    <TD key={field} className="text-right">
                      {editing && draft ? (
                        <PriceInput
                          label={`${v.code} ${field === "costPrice" ? "cost" : "price"}`}
                          value={draft[field]}
                          onChange={(value) => set(v.id, { [field]: value })}
                        />
                      ) : (
                        <span className={cn(field === "salePrice" && "font-medium")}>
                          {formatRs(v[field])}
                        </span>
                      )}
                    </TD>
                  ))}
                  <TD className="text-right whitespace-nowrap">
                    {formatQty(v.stockQty)} <span className="text-gray-400">{unitLabel}</span>
                  </TD>
                  <TD className="text-right">
                    {editing && draft ? (
                      <PriceInput
                        label={`${v.code} min stock`}
                        value={draft.minStock}
                        onChange={(value) => set(v.id, { minStock: value })}
                      />
                    ) : (
                      formatQty(v.minStock)
                    )}
                  </TD>
                  <TD>
                    {editing && draft ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.isActive}
                          onChange={(e) => set(v.id, { isActive: e.target.checked })}
                          className="size-4 accent-brand-700"
                        />
                        Active
                      </label>
                    ) : !v.isActive ? (
                      <Badge>Inactive</Badge>
                    ) : Number(v.stockQty) <= 0 ? (
                      <Badge tone="red">Out of stock</Badge>
                    ) : v.isLow ? (
                      <Badge tone="gold">Low</Badge>
                    ) : (
                      <Badge tone="green">In stock</Badge>
                    )}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>
      {editing ? (
        <p className="text-xs text-gray-500">
          Stock is changed from Inventory (stock in and adjustments), so every change is recorded.
        </p>
      ) : null}
    </div>
  );
}

function PriceInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ml-auto h-9 w-24 text-right"
    />
  );
}
