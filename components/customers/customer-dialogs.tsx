"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Pencil, UserPlus } from "lucide-react";
import { receivePaymentAction, saveCustomerAction } from "@/app/(app)/(admin)/customers/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { METHOD_LABELS } from "@/lib/cart";
import { formatRs } from "@/lib/format";

type Customer = { id: string; name: string; phone: string | null; notes: string | null };

export function CustomerFormButton({ customer }: { customer?: Customer }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    notes: customer?.notes ?? "",
    openingBalance: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerAction(customer?.id ?? null, form);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      if (customer) router.refresh();
      else router.push(`/customers/${result.data.id}`);
    });
  };

  return (
    <>
      {customer ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil className="size-4" aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="size-4" aria-hidden /> New customer
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={customer ? "Edit customer" : "New customer"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !form.name.trim()}>
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
          />
          <Field
            label="Phone (optional)"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Field
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          {!customer ? (
            <Field
              label="Old udhaar (optional)"
              hint="What they already owed before this system, in rupees"
              inputMode="numeric"
              value={form.openingBalance}
              onChange={(e) =>
                setForm({ ...form, openingBalance: e.target.value.replace(/[^\d]/g, "") })
              }
            />
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </>
  );
}

const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "JAZZCASH", "EASYPAISA"] as const;

export function ReceivePaymentButton({
  customer,
  balance,
  dayOpen,
}: {
  customer: { id: string; name: string };
  balance: number;
  /** Payments need an open register day. */
  dayOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await receivePaymentAction({ customerId: customer.id, amount, method, note });
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={balance <= 0 || !dayOpen}
        title={
          !dayOpen ? "The day is closed. Open it in Cash Register to take payments." : undefined
        }
      >
        <HandCoins className="size-4" aria-hidden /> Receive payment
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Payment from ${customer.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !amount}>
              {pending ? "Saving…" : `Receive ${amount ? formatRs(Number(amount)) : ""}`}
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
            Owes <strong>{formatRs(balance)}</strong>.{" "}
            <button
              type="button"
              className="text-brand-700 underline"
              onClick={() => setAmount(String(balance))}
            >
              Full amount
            </button>
          </p>
          <Field
            label="Amount received (Rs)"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            autoFocus
          />
          <div className="space-y-1">
            <label htmlFor="receive-method" className="block text-xs font-medium text-gray-600">
              Paid by
            </label>
            <Select
              id="receive-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as typeof method)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <Field
            label="Note (optional)"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
          />
          {method === "CASH" ? (
            <p className="text-xs text-gray-500">
              Cash payments are added to today&apos;s expected cash in the drawer.
            </p>
          ) : null}
          {error ? <Alert tone="error">{error}</Alert> : null}
          <button type="submit" hidden />
        </form>
      </Dialog>
    </>
  );
}
