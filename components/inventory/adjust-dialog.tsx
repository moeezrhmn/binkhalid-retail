"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { adjustStockAction } from "@/app/(app)/(admin)/inventory/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatQty } from "@/lib/format";

const REASONS = [
  { value: "Damage", hint: "Quantity removed (damaged goods)" },
  { value: "Loss", hint: "Quantity removed (lost or stolen)" },
  { value: "Count correction", hint: "Quantity actually on the shelf after counting" },
  { value: "Other", hint: "Change: 5 adds stock, -5 removes it" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

export function AdjustStockButton({
  variant,
}: {
  variant: { id: string; code: string; name: string; stockQty: string; unitLabel: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const [reason, setReason] = useState<Reason>("Damage");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setQty("");
    setNote("");
    setError(null);
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await adjustStockAction({
        variantId: variant.id,
        reason,
        qty,
        note: note || null,
      });
      if (!result.ok) return setError(result.error);
      close();
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-4" aria-hidden /> Adjust
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Adjust stock: ${variant.code}`}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !qty.trim()}>
              {pending ? "Saving…" : "Save adjustment"}
            </Button>
          </>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-gray-600">
            {variant.name}. In stock now:{" "}
            <strong>
              {formatQty(variant.stockQty)} {variant.unitLabel}
            </strong>
          </p>
          <div className="space-y-1">
            <label htmlFor={reasonId} className="block text-xs font-medium text-gray-600">
              Reason
            </label>
            <Select
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.value}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label={reason === "Count correction" ? "Counted quantity" : "Quantity"}
            hint={REASONS.find((r) => r.value === reason)?.hint}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            autoFocus
          />
          <Field
            label={reason === "Other" ? "Note (required)" : "Note (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </>
  );
}
