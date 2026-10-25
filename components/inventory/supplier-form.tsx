"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveSupplierAction } from "@/app/(app)/(admin)/inventory/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";

type Supplier = { id?: string; name: string; phone: string | null; notes: string | null };

export function SupplierButton({ supplier }: { supplier?: Supplier }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Supplier>(supplier ?? { name: "", phone: null, notes: null });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveSupplierAction({ ...form, id: supplier?.id });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      if (!supplier) setForm({ name: "", phone: null, notes: null });
      router.refresh();
    });
  };

  return (
    <>
      {supplier ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-4" aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> New supplier
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={supplier ? "Edit supplier" : "New supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
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
          <Field
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            required
          />
          <Field
            label="Phone"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Field
            label="Notes"
            value={form.notes ?? ""}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </>
  );
}
