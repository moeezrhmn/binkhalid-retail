"use client";

import { useRef, useState, useTransition } from "react";
import { UserPlus, UserRound, X } from "lucide-react";
import {
  quickAddCustomerAction,
  searchCustomersAction,
  similarCustomersAction,
} from "@/app/(app)/pos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerOption } from "@/server/services/customers";

export function CustomerPicker({
  value,
  onChange,
  inputRef,
  invalid,
  locked,
}: {
  value: CustomerOption | null;
  onChange: (customer: CustomerOption | null) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  invalid?: boolean;
  /** Exchanges keep the original bill's customer. */
  locked?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CustomerOption[] | null>(null);
  const [adding, setAdding] = useState<{ name: string; phone: string } | null>(null);
  const [similar, setSimilar] = useState<CustomerOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Separate from `pending`: the similar-name check runs when the name field loses
  // focus, which is also what clicking Save does, so it must never disable Save.
  const [, startSimilarCheck] = useTransition();
  const latest = useRef("");

  const search = (text: string) => {
    setQ(text);
    latest.current = text;
    setError(null);
    if (text.trim().length < 2) return setResults(null);
    startTransition(async () => {
      const found = await searchCustomersAction(text);
      if (latest.current === text) setResults(found);
    });
  };

  const pick = (customer: CustomerOption) => {
    onChange(customer);
    setQ("");
    setResults(null);
    setAdding(null);
    setSimilar([]);
  };

  const startAdding = () => {
    const digits = q.replace(/\D/g, "");
    const isPhone = digits.length >= 7 && digits.length >= q.replace(/\s/g, "").length - 2;
    setAdding({ name: isPhone ? "" : q.trim(), phone: isPhone ? q.trim() : "" });
    setResults(null);
  };

  const save = () => {
    if (!adding) return;
    setError(null);
    startTransition(async () => {
      const result = await quickAddCustomerAction(adding);
      if (!result.ok) return setError(result.error);
      pick(result.data);
    });
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-2.5 py-1.5">
        <UserRound className="size-4 shrink-0 text-brand-700" aria-hidden />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold text-gray-900">{value.name}</p>
          <p className="text-xs text-gray-500">{value.phone ?? "No phone"}</p>
        </div>
        {!locked ? (
          <button
            type="button"
            aria-label="Change customer"
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="rounded p-1 text-gray-500 hover:bg-white"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    );
  }

  if (adding) {
    return (
      <div className="space-y-2 rounded-md border border-gray-200 p-2.5">
        <p className="text-xs font-semibold text-gray-700">New customer</p>
        <Input
          aria-label="Customer name"
          placeholder="Name"
          value={adding.name}
          autoFocus={!adding.name}
          onChange={(e) => setAdding({ ...adding, name: e.target.value })}
          onBlur={() => {
            if (!adding.phone.trim() && adding.name.trim().length >= 3) {
              startSimilarCheck(async () => setSimilar(await similarCustomersAction(adding.name)));
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        />
        <Input
          aria-label="Customer phone (optional)"
          placeholder="Phone (optional)"
          inputMode="tel"
          value={adding.phone}
          autoFocus={Boolean(adding.name)}
          onChange={(e) => setAdding({ ...adding, phone: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}
        />
        {similar.length > 0 && !adding.phone.trim() ? (
          <div className="rounded-md bg-gold-300/25 p-2 text-xs">
            <p className="mb-1 font-medium text-gray-800">Already a customer?</p>
            {similar.map((customer) => (
              <button
                key={customer.id}
                type="button"
                onClick={() => pick(customer)}
                className="block w-full rounded px-1.5 py-1 text-left hover:bg-white"
              >
                {customer.name} <span className="text-gray-500">{customer.phone ?? ""}</span>
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={pending || !adding.name.trim()}>
            Save customer
          </Button>
          <Button size="sm" variant="ghost" onClick={() => (setAdding(null), setSimilar([]))}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        aria-label="Customer phone or name"
        aria-invalid={invalid || undefined}
        placeholder="Customer phone or name (F2)"
        value={q}
        onChange={(e) => search(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results?.length === 1) pick(results[0]);
            else if (results && results.length === 0) startAdding();
          }
        }}
      />
      {results ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => pick(customer)}
                className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <span className="font-medium">{customer.name}</span>
                <span className="text-gray-500">{customer.phone ?? ""}</span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={startAdding}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-brand-700 hover:bg-gray-50"
            >
              <UserPlus className="size-4" aria-hidden /> Add new customer
              {results.length === 0 ? (
                <span className="font-normal text-gray-500">(Enter)</span>
              ) : null}
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
