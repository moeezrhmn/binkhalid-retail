"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, History, Minus, Plus, ScanLine, Trash2, X } from "lucide-react";
import {
  completeSaleAction,
  getHeldAction,
  holdSaleAction,
  listHeldAction,
  lookupAction,
} from "@/app/(app)/pos/actions";
import type { DayStatus } from "@/server/services/cash";
import { DayClosedNotice } from "@/components/cash/day-closed-notice";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  cartTotals,
  METHOD_LABELS,
  PAYMENT_METHODS,
  priceLine,
  productLineDiscount,
  type SalePaymentMethod,
} from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatQty, formatRs } from "@/lib/format";
import { qtyToMilli } from "@/lib/money";
import { ROLE_LABELS } from "@/lib/roles";
import { beepError, beepOk } from "@/lib/sound";
import { allowsFraction, UNIT_LABELS, validateQty } from "@/lib/units";
import type { CustomerOption } from "@/server/services/customers";
import type { PosVariant } from "@/server/services/sales";
import { CustomerPicker } from "./customer-picker";
import { HeldBillsDialog, QtyDialog, RecentBillsDialog } from "./pos-dialogs";

type Line = { variant: PosVariant; qty: string; discount: string; discountAuto: boolean };
type Split = { method: SalePaymentMethod; amount: string };

export type PosExchange = {
  originalSaleId: string;
  billNo: number;
  customer: CustomerOption;
  credit: number;
  items: { saleItemId: string; name: string; qty: string; restock: boolean; amount: number }[];
};

const toInt = (text: string) => {
  const value = Number(text.replace(/[,\s]/g, ""));
  return Number.isFinite(value) ? Math.round(value) : 0;
};

function safeLine(line: Line) {
  const invalid = validateQty(line.variant.unit, line.qty);
  const priced = invalid
    ? { gross: 0, discount: 0, lineTotal: 0 }
    : priceLine(line.variant.price, line.qty, toInt(line.discount));
  return { ...priced, invalid };
}

function autoDiscount(variant: PosVariant, qty: string) {
  try {
    return String(productLineDiscount(variant.price, qty, variant.productDiscount) || "");
  } catch {
    return "";
  }
}

/** Prints a receipt from a hidden frame so the cashier never leaves the POS. */
function printReceipt(saleId: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.src = `/print/receipt/${saleId}?auto=1`;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 120_000);
}

export function PosScreen({
  userName,
  userRole,
  exchange,
  saved,
  day,
  isAdmin,
}: {
  userName: string;
  userRole: "ADMIN" | "STAFF";
  exchange: PosExchange | null;
  /** Shown after an exchange, which reloads the POS to leave exchange mode. */
  saved?: { billNo: number; giveBack: number } | null;
  /** Billing needs an open register day. */
  day: DayStatus;
  isAdmin: boolean;
}) {
  const dayOpen = day.open;
  const router = useRouter();
  const scanRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [customer, setCustomer] = useState<CustomerOption | null>(exchange?.customer ?? null);
  const [customerMissing, setCustomerMissing] = useState(false);
  const [billDiscount, setBillDiscount] = useState("");
  const [showBillDiscount, setShowBillDiscount] = useState(false);
  const [heldSaleId, setHeldSaleId] = useState<string | null>(null);
  const [method, setMethod] = useState<SalePaymentMethod>("CASH");
  const [split, setSplit] = useState<Split[] | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [scan, setScan] = useState("");
  const [matches, setMatches] = useState<PosVariant[]>([]);
  const [flash, setFlash] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [lastSale, setLastSale] = useState<{
    billNo: number;
    change: number;
    refund: number;
  } | null>(saved ? { billNo: saved.billNo, change: 0, refund: saved.giveBack } : null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [editingDiscount, setEditingDiscount] = useState<string | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [heldOpen, setHeldOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [askQty, setAskQty] = useState<PosVariant | null>(null);
  const [busy, startBusy] = useTransition();
  const [looking, startLookup] = useTransition();

  const focusScan = () => {
    requestAnimationFrame(() => scanRef.current?.focus());
  };
  const refreshHeld = () => {
    listHeldAction().then((rows) => setHeldCount(rows.length));
  };

  useEffect(() => {
    listHeldAction().then((rows) => setHeldCount(rows.length));
  }, []);

  // ----- totals -----
  const priced = lines.map(safeLine);
  const totals = cartTotals(
    priced.map((p) => p.lineTotal),
    toInt(billDiscount),
  );
  const credit = exchange?.credit ?? 0;
  const due = Math.max(0, totals.total - credit);
  const refundBack = Math.max(0, credit - totals.total);

  const payments = (() => {
    if (due === 0) return [];
    if (!split) return [{ method, amount: due }];
    return split.map((row) => ({ method: row.method, amount: toInt(row.amount) }));
  })();
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = due - paid;
  const cashPart = payments
    .filter((p) => p.method === "CASH")
    .reduce((sum, p) => sum + p.amount, 0);
  const cashGiven = cashReceived.trim() ? toInt(cashReceived) : null;
  const change = cashGiven !== null ? cashGiven - cashPart : 0;

  const problems = [
    lines.length === 0 && "Scan an item to start the bill",
    priced.some((p) => p.invalid) && "Fix the quantities marked in red",
    remaining !== 0 &&
      (remaining > 0
        ? `Rs ${remaining} is still unpaid`
        : `Payments are Rs ${-remaining} too much`),
    payments.some((p) => p.amount <= 0) && "Every payment needs an amount",
    cashGiven !== null && cashGiven < cashPart && `Cash received is less than Rs ${cashPart}`,
  ].filter(Boolean) as string[];

  // ----- adding items -----
  const addVariant = (variant: PosVariant, qty?: string) => {
    setMatches([]);
    setLastSale(null);
    if (!variant.isActive) {
      beepError();
      setFlash({ tone: "error", text: `${variant.name} is inactive and cannot be sold.` });
      return focusScan();
    }
    if (allowsFraction(variant.unit) && qty === undefined) {
      setAskQty(variant);
      return;
    }
    const adding = qty ?? "1";
    const existing = lines.find((line) => line.variant.id === variant.id);
    const newQtyMilli = qtyToMilli(existing?.qty || "0") + qtyToMilli(adding);
    const stockMilli = qtyToMilli(variant.stockQty);
    if (newQtyMilli > stockMilli) {
      const left = formatQty(variant.stockQty);
      if (
        !confirm(
          `${variant.name}${variant.label ? ` · ${variant.label}` : ""}: only ${left} in stock. Sell anyway?`,
        )
      ) {
        return focusScan();
      }
    }
    const newQty = String(newQtyMilli / 1000);
    setLines((list) => {
      if (list.some((line) => line.variant.id === variant.id)) {
        return list.map((line) =>
          line.variant.id === variant.id
            ? {
                ...line,
                qty: newQty,
                discount: line.discountAuto ? autoDiscount(variant, newQty) : line.discount,
              }
            : line,
        );
      }
      return [
        ...list,
        { variant, qty: newQty, discount: autoDiscount(variant, newQty), discountAuto: true },
      ];
    });
    setFlash(null);
    setHighlight(variant.id);
    setTimeout(() => setHighlight((id) => (id === variant.id ? null : id)), 700);
    beepOk();
    requestAnimationFrame(() => cartEndRef.current?.scrollIntoView({ block: "nearest" }));
    focusScan();
  };

  const submitScan = () => {
    const term = scan.trim();
    if (!term) return;
    startLookup(async () => {
      const result = await lookupAction(term);
      if (result.exact) {
        setScan("");
        return addVariant(result.exact);
      }
      if (result.matches.length === 1) {
        setScan("");
        return addVariant(result.matches[0]);
      }
      if (result.matches.length === 0) {
        beepError();
        setMatches([]);
        setFlash({ tone: "error", text: `No item found for "${term}".` });
        setScan("");
        return;
      }
      setMatches(result.matches);
    });
  };

  const setLine = (id: string, change: Partial<Line>) =>
    setLines((list) =>
      list.map((line) => {
        if (line.variant.id !== id) return line;
        const next = { ...line, ...change };
        if ("qty" in change && line.discountAuto)
          next.discount = autoDiscount(line.variant, next.qty);
        return next;
      }),
    );

  const step = (line: Line, delta: number) => {
    const next = Math.max(1, Number(line.qty) + delta);
    if (delta > 0 && qtyToMilli(String(next)) > qtyToMilli(line.variant.stockQty)) {
      if (!confirm(`Only ${formatQty(line.variant.stockQty)} in stock. Sell anyway?`)) return;
    }
    setLine(line.variant.id, { qty: String(next) });
  };

  // ----- bill actions -----
  const reset = () => {
    setLines([]);
    setCustomer(exchange ? exchange.customer : null);
    setBillDiscount("");
    setShowBillDiscount(false);
    setHeldSaleId(null);
    setMethod("CASH");
    setSplit(null);
    setCashReceived("");
    setMatches([]);
    setCustomerMissing(false);
  };

  const cartPayload = () => ({
    heldSaleId,
    customerId: customer?.id ?? null,
    lines: lines.map((line, index) => ({
      variantId: line.variant.id,
      qty: line.qty.trim(),
      discount: priced[index].discount,
    })),
    billDiscount: totals.discount,
  });

  const complete = () => {
    if (busy) return;
    if (!customer) {
      setCustomerMissing(true);
      beepError();
      setFlash({ tone: "error", text: "Pick the customer for this bill (F2)." });
      requestAnimationFrame(() => customerRef.current?.focus());
      return;
    }
    if (problems.length > 0) {
      beepError();
      setFlash({ tone: "error", text: problems[0] });
      return;
    }
    startBusy(async () => {
      const result = await completeSaleAction({
        ...cartPayload(),
        payments,
        cashReceived: cashPart > 0 ? (cashGiven ?? cashPart) : null,
        exchange: exchange
          ? {
              originalSaleId: exchange.originalSaleId,
              items: exchange.items.map(({ saleItemId, qty, restock }) => ({
                saleItemId,
                qty,
                restock,
              })),
            }
          : null,
      });
      if (!result.ok) {
        beepError();
        setFlash({ tone: "error", text: result.error });
        return;
      }
      printReceipt(result.data.id);
      setLastSale({
        billNo: result.data.billNo,
        change: result.data.change,
        refund: result.data.exchangeRefund,
      });
      setFlash(null);
      reset();
      refreshHeld();
      beepOk();
      if (exchange) {
        const giveBack = result.data.change + result.data.exchangeRefund;
        router.replace(`/pos?saved=${result.data.billNo}&back=${giveBack}`);
      }
      focusScan();
    });
  };

  const hold = () => {
    if (busy || lines.length === 0 || exchange) return;
    startBusy(async () => {
      const result = await holdSaleAction(cartPayload());
      if (!result.ok) return setFlash({ tone: "error", text: result.error });
      reset();
      refreshHeld();
      setFlash({ tone: "success", text: "Bill held. Resume it from Held bills." });
      focusScan();
    });
  };

  const resume = (id: string) => {
    if (lines.length > 0 && !confirm("This clears the bill on screen. Continue?")) return;
    startBusy(async () => {
      const result = await getHeldAction(id);
      setHeldOpen(false);
      if (!result.ok) return setFlash({ tone: "error", text: result.error });
      reset();
      setLines(
        result.data.lines.map((line) => ({
          variant: line.variant,
          qty: line.qty,
          discount: line.discount ? String(line.discount) : "",
          discountAuto: false,
        })),
      );
      setCustomer(result.data.customer);
      setBillDiscount(result.data.billDiscount ? String(result.data.billDiscount) : "");
      setShowBillDiscount(result.data.billDiscount > 0);
      setHeldSaleId(result.data.id);
      setFlash({ tone: "success", text: "Held bill resumed. Prices are today's prices." });
      focusScan();
    });
  };

  const clearBill = () => {
    if (lines.length > 0 && !confirm("Clear this bill?")) return;
    reset();
    setFlash(null);
    focusScan();
  };

  // ----- keyboard shortcuts -----
  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (document.querySelector("dialog[open]")) return;
    if (event.key === "F2") {
      event.preventDefault();
      customerRef.current?.focus();
    } else if (event.key === "F4") {
      event.preventDefault();
      cashRef.current?.focus();
    } else if (event.key === "F8") {
      event.preventDefault();
      hold();
    } else if (event.key === "F9" || (event.key === "Enter" && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      complete();
    } else if (event.key === "Escape") {
      setMatches([]);
      scanRef.current?.focus();
    }
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const quickCash = (() => {
    if (cashPart <= 0) return [];
    const options = new Set<number>([cashPart]);
    for (const step of [100, 500, 1000, 5000]) {
      const rounded = Math.ceil(cashPart / step) * step;
      if (rounded > cashPart) options.add(rounded);
    }
    return [...options].slice(0, 4);
  })();

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-2rem)] lg:flex-row">
      {/* ---------- left: scan + cart ---------- */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">POS / Billing</h1>
          <span className="text-xs text-gray-500">
            Served by: <span className="font-medium text-gray-700">{userName}</span> (
            {ROLE_LABELS[userRole]})
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setHeldOpen(true)}>
              <Clock className="size-4" aria-hidden /> Held ({heldCount})
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setRecentOpen(true)}>
              <History className="size-4" aria-hidden /> Today&apos;s bills
            </Button>
          </div>
        </div>

        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <Input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                submitScan();
              }
            }}
            placeholder="Scan a barcode, or type a name or code and press Enter"
            aria-label="Scan or search items"
            autoFocus
            autoComplete="off"
            className="h-12 pl-10 text-base"
          />
          {looking ? (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 text-xs text-gray-400">
              Searching…
            </span>
          ) : null}
          {matches.length > 0 ? (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {matches.map((variant) => (
                <li key={variant.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setScan("");
                      addVariant(variant);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{variant.name}</span>
                      {variant.label ? (
                        <span className="text-gray-500"> · {variant.label}</span>
                      ) : null}
                      <span className="ml-2 font-mono text-xs text-gray-400">{variant.code}</span>
                    </span>
                    <span className="shrink-0 text-gray-700">
                      {formatRs(variant.price)}{" "}
                      <span className="text-xs text-gray-400">
                        ({formatQty(variant.stockQty)} left)
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {exchange ? (
          <Alert className="flex flex-wrap items-center justify-between gap-2 border-gold-300 bg-gold-300/20">
            <span>
              <strong>Exchange for bill #{exchange.billNo}:</strong> {exchange.items.length} item
              {exchange.items.length === 1 ? "" : "s"} coming back, worth{" "}
              <strong>{formatRs(credit)}</strong>. Scan what the customer takes instead.
            </span>
            <Button size="sm" variant="ghost" onClick={() => router.replace("/pos")}>
              <X className="size-4" aria-hidden /> Cancel exchange
            </Button>
          </Alert>
        ) : null}

        <DayClosedNotice
          day={day}
          action="complete sales"
          isAdmin={isAdmin}
          extra="Sales can still be held meanwhile."
        />

        {lastSale ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-2"
          >
            <CheckCircle2 className="size-6 text-brand-700" aria-hidden />
            <p className="text-sm text-brand-800">
              <strong>Bill #{lastSale.billNo} saved.</strong> Receipt sent to the printer.
            </p>
            {lastSale.change > 0 || lastSale.refund > 0 ? (
              <p className="ml-auto text-xl font-bold text-brand-800">
                Give back {formatRs(lastSale.change + lastSale.refund)}
              </p>
            ) : null}
          </div>
        ) : null}
        {flash ? <Alert tone={flash.tone}>{flash.text}</Alert> : null}

        <div className="min-h-64 flex-1 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-xs tracking-wide text-gray-600 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-center font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Discount</th>
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((line, index) => {
                const p = priced[index];
                const whole = !allowsFraction(line.variant.unit);
                const short =
                  qtyToMilli(line.variant.stockQty) < (p.invalid ? 0 : qtyToMilli(line.qty));
                return (
                  <tr
                    key={line.variant.id}
                    className={cn(
                      "transition-colors",
                      highlight === line.variant.id && "bg-gold-300/30",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <div className="font-medium text-gray-900">
                        {line.variant.name}
                        {line.variant.label ? (
                          <span className="font-normal text-gray-500"> · {line.variant.label}</span>
                        ) : null}
                      </div>
                      <div className="font-mono text-xs text-gray-400">
                        {line.variant.code}
                        {short ? (
                          <span className="ml-2 font-sans text-red-600">
                            Over stock ({formatQty(line.variant.stockQty)} left)
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {formatRs(line.variant.price)}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-center gap-1">
                        {whole ? (
                          <button
                            type="button"
                            aria-label="One less"
                            onClick={() => step(line, -1)}
                            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                          >
                            <Minus className="size-4" />
                          </button>
                        ) : null}
                        <Input
                          aria-label={`Quantity of ${line.variant.code}`}
                          inputMode="decimal"
                          value={line.qty}
                          onChange={(e) => setLine(line.variant.id, { qty: e.target.value })}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusScan())}
                          aria-invalid={p.invalid ? true : undefined}
                          className="h-8 w-16 text-center"
                        />
                        {whole ? (
                          <button
                            type="button"
                            aria-label="One more"
                            onClick={() => step(line, 1)}
                            className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
                          >
                            <Plus className="size-4" />
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">
                            {UNIT_LABELS[line.variant.unit].toLowerCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {editingDiscount === line.variant.id || toInt(line.discount) > 0 ? (
                        <Input
                          aria-label={`Discount on ${line.variant.code} in rupees`}
                          inputMode="numeric"
                          value={line.discount}
                          autoFocus={editingDiscount === line.variant.id}
                          onChange={(e) =>
                            setLine(line.variant.id, {
                              discount: e.target.value.replace(/[^\d]/g, ""),
                              discountAuto: false,
                            })
                          }
                          onBlur={() => setEditingDiscount(null)}
                          onKeyDown={(e) =>
                            e.key === "Enter" &&
                            (e.preventDefault(), setEditingDiscount(null), focusScan())
                          }
                          className="ml-auto h-8 w-20 text-right"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingDiscount(line.variant.id)}
                          className="text-xs text-brand-700 hover:underline"
                        >
                          + Discount
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">
                      {formatRs(p.lineTotal)}
                    </td>
                    <td className="pr-2">
                      <button
                        type="button"
                        aria-label={`Remove ${line.variant.code}`}
                        onClick={() => {
                          setLines((list) => list.filter((l) => l.variant.id !== line.variant.id));
                          focusScan();
                        }}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lines.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-gray-400">
              Scan a barcode to start the bill.
            </p>
          ) : null}
          <div ref={cartEndRef} />
        </div>
      </section>

      {/* ---------- right: customer, totals, payment ---------- */}
      <aside className="flex w-full shrink-0 flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm lg:w-96 lg:overflow-y-auto">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-600">Customer</p>
          <CustomerPicker
            value={customer}
            onChange={(c) => {
              setCustomer(c);
              setCustomerMissing(false);
              if (c) {
                setFlash((current) =>
                  current?.text.startsWith("Pick the customer") ? null : current,
                );
                focusScan();
              }
            }}
            inputRef={customerRef}
            invalid={customerMissing}
            locked={Boolean(exchange)}
          />
        </div>

        <dl className="space-y-1 border-y border-gray-100 py-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">
              Subtotal ({lines.length} item{lines.length === 1 ? "" : "s"})
            </dt>
            <dd>{formatRs(totals.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">Bill discount</dt>
            <dd>
              {showBillDiscount ? (
                <Input
                  aria-label="Bill discount in rupees"
                  inputMode="numeric"
                  value={billDiscount}
                  autoFocus={!billDiscount}
                  onChange={(e) => setBillDiscount(e.target.value.replace(/[^\d]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), focusScan())}
                  className="h-7 w-24 text-right"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBillDiscount(true)}
                  className="text-xs text-brand-700 hover:underline"
                >
                  + Add
                </button>
              )}
            </dd>
          </div>
          {credit > 0 ? (
            <div className="flex justify-between text-gold-600">
              <dt>Exchange credit</dt>
              <dd>− {formatRs(credit)}</dd>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="font-semibold text-gray-900">{credit > 0 ? "To pay" : "Total"}</dt>
            <dd className="text-2xl font-bold text-gray-900">{formatRs(due)}</dd>
          </div>
          {refundBack > 0 ? (
            <div className="flex justify-between font-semibold text-brand-700">
              <dt>Give back in cash</dt>
              <dd>{formatRs(refundBack)}</dd>
            </div>
          ) : null}
        </dl>

        {due > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600">Payment</p>
              <button
                type="button"
                className="text-xs text-brand-700 hover:underline"
                onClick={() =>
                  setSplit(
                    split
                      ? null
                      : [
                          { method, amount: String(due) },
                          { method: method === "CASH" ? "CREDIT" : "CASH", amount: "" },
                        ],
                  )
                }
              >
                {split ? "Single payment" : "Split payment"}
              </button>
            </div>
            {!split ? (
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "h-10 rounded-lg text-[13px] font-semibold transition-[background-color,box-shadow] duration-100",
                      method === m
                        ? "bg-brand-700 bg-linear-to-b from-white/10 to-transparent text-white shadow-btn-primary"
                        : "bg-white text-gray-800 shadow-btn hover:bg-gray-50 active:shadow-btn-pressed",
                    )}
                  >
                    {METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {split.map((row, index) => (
                  <div key={index} className="flex gap-1.5">
                    <Select
                      aria-label={`Payment ${index + 1} method`}
                      value={row.method}
                      onChange={(e) =>
                        setSplit(
                          split.map((r, i) =>
                            i === index ? { ...r, method: e.target.value as SalePaymentMethod } : r,
                          ),
                        )
                      }
                      className="h-8 flex-1"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABELS[m]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Payment ${index + 1} amount`}
                      inputMode="numeric"
                      value={row.amount}
                      onChange={(e) =>
                        setSplit(
                          split.map((r, i) =>
                            i === index
                              ? { ...r, amount: e.target.value.replace(/[^\d]/g, "") }
                              : r,
                          ),
                        )
                      }
                      className="h-8 w-28 text-right"
                    />
                    <button
                      type="button"
                      aria-label="Remove payment"
                      disabled={split.length <= 1}
                      onClick={() => setSplit(split.filter((_, i) => i !== index))}
                      className="rounded p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    className="text-brand-700 hover:underline"
                    onClick={() =>
                      setSplit([
                        ...split,
                        { method: "CASH", amount: remaining > 0 ? String(remaining) : "" },
                      ])
                    }
                  >
                    + Add payment
                  </button>
                  <span
                    className={cn(
                      remaining === 0 ? "text-brand-700" : "font-semibold text-red-600",
                    )}
                  >
                    {remaining === 0
                      ? "Fully paid"
                      : remaining > 0
                        ? `${formatRs(remaining)} left`
                        : `${formatRs(-remaining)} too much`}
                  </span>
                </div>
              </div>
            )}
            {payments.some((p) => p.method === "CREDIT") ? (
              <p className="text-xs text-gold-600">
                The udhaar part is added to {customer?.name ?? "the customer"}&apos;s balance.
              </p>
            ) : null}

            {cashPart > 0 ? (
              <div className="space-y-1.5 rounded-md bg-gray-50 p-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="cash-received" className="text-xs font-medium text-gray-600">
                    Cash received (F4)
                  </label>
                  <Input
                    id="cash-received"
                    ref={cashRef}
                    inputMode="numeric"
                    value={cashReceived}
                    placeholder={String(cashPart)}
                    onChange={(e) => setCashReceived(e.target.value.replace(/[^\d]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), complete())}
                    className="ml-auto h-8 w-28 text-right"
                  />
                </div>
                <div className="flex gap-1.5">
                  {quickCash.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashReceived(String(amount))}
                      className="h-7 flex-1 rounded-md bg-white text-xs font-semibold text-gray-800 shadow-btn hover:bg-gray-50 active:shadow-btn-pressed"
                    >
                      {amount === cashPart ? "Exact" : formatRs(amount)}
                    </button>
                  ))}
                </div>
                {cashGiven !== null ? (
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium text-gray-700">Change</span>
                    <span
                      className={cn(
                        "text-xl font-bold",
                        change < 0 ? "text-red-600" : "text-brand-700",
                      )}
                    >
                      {change < 0 ? `${formatRs(-change)} short` : formatRs(change)}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto space-y-2 pt-1">
          <Button
            size="lg"
            className="w-full"
            onClick={complete}
            disabled={busy || lines.length === 0 || !dayOpen}
          >
            {busy ? "Saving…" : "Complete sale & print (F9)"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={hold}
              disabled={busy || lines.length === 0 || Boolean(exchange)}
            >
              Hold bill (F8)
            </Button>
            <Button variant="ghost" onClick={clearBill} disabled={busy}>
              Clear
            </Button>
          </div>
          {heldSaleId ? (
            <p className="text-center text-xs text-gray-500">Resumed from a held bill</p>
          ) : null}
        </div>
      </aside>

      <HeldBillsDialog
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        onResume={resume}
        onChanged={refreshHeld}
      />
      <RecentBillsDialog
        open={recentOpen}
        onClose={() => {
          setRecentOpen(false);
          focusScan();
        }}
        onReprint={(id) => printReceipt(id)}
      />
      <QtyDialog
        variant={askQty}
        onClose={() => {
          setAskQty(null);
          focusScan();
        }}
        onConfirm={(qty) => {
          const variant = askQty;
          setAskQty(null);
          if (variant) addVariant(variant, qty);
        }}
      />
    </div>
  );
}
