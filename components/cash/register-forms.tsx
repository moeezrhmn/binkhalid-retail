"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeDayAction, drawerOutAction, openDayAction } from "@/app/(app)/(admin)/cash/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatRs } from "@/lib/format";

export function OpenDayForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await openDayAction(amount || "0");
          if (!result.ok) return setError(result.error);
          router.refresh();
        });
      }}
    >
      <Field
        label="Opening cash in the drawer (Rs)"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
        autoFocus
        className="w-64"
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open the day"}
      </Button>
      {error ? (
        <Alert tone="error" className="w-full">
          {error}
        </Alert>
      ) : null}
    </form>
  );
}

export function DrawerOutForm() {
  const router = useRouter();
  const [type, setType] = useState<"CASH_OUT" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await drawerOutAction({ type, amount, note });
          if (!result.ok) return setMessage({ tone: "error", text: result.error });
          setMessage({
            tone: "success",
            text: `${type === "EXPENSE" ? "Expense" : "Cash out"} of ${formatRs(Number(amount))} recorded.`,
          });
          setAmount("");
          setNote("");
          router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40 space-y-1">
          <label htmlFor="out-type" className="block text-xs font-medium text-gray-600">
            Money taken out for
          </label>
          <Select
            id="out-type"
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            <option value="EXPENSE">Shop expense</option>
            <option value="CASH_OUT">Cash out (owner)</option>
          </Select>
        </div>
        <Field
          label="Amount (Rs)"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          className="w-32"
        />
        <Field
          label="Note (required)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder={type === "EXPENSE" ? "e.g. Tea, electricity bill" : "e.g. Taken by owner"}
          className="min-w-48 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending || !amount || !note.trim()}>
          Record
        </Button>
      </div>
      {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}
    </form>
  );
}

export function CloseDayForm({ expectedCash }: { expectedCash: number }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const difference = counted ? Number(counted) - expectedCash : null;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!counted) return setError("Count the drawer and enter the amount");
        if (!confirm(`Close the day with ${formatRs(Number(counted))} counted?`)) return;
        setError(null);
        startTransition(async () => {
          const result = await closeDayAction(counted, note);
          if (!result.ok) return setError(result.error);
          router.push(`/cash/${result.data.id}`);
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label="Counted cash (Rs)"
          inputMode="numeric"
          value={counted}
          onChange={(e) => setCounted(e.target.value.replace(/[^\d]/g, ""))}
          className="w-40"
        />
        <Field
          label="Note (optional)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          className="min-w-48 flex-1"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Closing…" : "Close the day"}
        </Button>
      </div>
      {difference !== null ? (
        <p
          className={
            difference === 0
              ? "text-sm font-semibold text-brand-700"
              : "text-sm font-semibold text-red-600"
          }
        >
          {difference === 0
            ? "Matches the expected cash."
            : difference > 0
              ? `${formatRs(difference)} more than expected`
              : `${formatRs(-difference)} short`}
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </form>
  );
}
