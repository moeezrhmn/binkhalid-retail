"use client";

import { useEffect, useState, useTransition } from "react";
import { Printer, RotateCcw, Trash2 } from "lucide-react";
import { discardHeldAction, listHeldAction, recentBillsAction } from "@/app/(app)/pos/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatRs } from "@/lib/format";
import { UNIT_LABELS } from "@/lib/units";
import { validateQty } from "@/lib/units";
import type { PosVariant } from "@/server/services/sales";

type Held = Awaited<ReturnType<typeof listHeldAction>>[number];
type Recent = Awaited<ReturnType<typeof recentBillsAction>>[number];

export function HeldBillsDialog({
  open,
  onClose,
  onResume,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onResume: (id: string) => void;
  onChanged: () => void;
}) {
  const [bills, setBills] = useState<Held[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listHeldAction().then((rows) => !cancelled && setBills(rows));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const discard = (bill: Held) => {
    if (!confirm(`Discard the held bill of ${formatRs(bill.total)}? This cannot be undone.`))
      return;
    startTransition(async () => {
      await discardHeldAction(bill.id);
      setBills(await listHeldAction());
      onChanged();
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Held bills">
      {bills === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="text-sm text-gray-500">No bills are on hold.</p>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Held at</TH>
              <TH>Customer</TH>
              <TH className="text-right">Items</TH>
              <TH className="text-right">Total</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {bills.map((bill) => (
              <TR key={bill.id}>
                <TD className="text-xs whitespace-nowrap">{formatDateTime(bill.createdAt)}</TD>
                <TD>{bill.customerName ?? <span className="text-gray-400">Not picked</span>}</TD>
                <TD className="text-right">{bill.itemCount}</TD>
                <TD className="text-right font-medium">{formatRs(bill.total)}</TD>
                <TD className="text-right whitespace-nowrap">
                  <Button size="sm" onClick={() => onResume(bill.id)}>
                    <RotateCcw className="size-4" aria-hidden /> Resume
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Discard"
                    onClick={() => discard(bill)}
                    disabled={pending}
                  >
                    <Trash2 className="size-4 text-red-600" />
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Dialog>
  );
}

export function RecentBillsDialog({
  open,
  onClose,
  onReprint,
}: {
  open: boolean;
  onClose: () => void;
  onReprint: (saleId: string) => void;
}) {
  const [bills, setBills] = useState<Recent[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    recentBillsAction().then((rows) => !cancelled && setBills(rows));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Today's bills">
      {bills === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : bills.length === 0 ? (
        <p className="text-sm text-gray-500">No bills yet today.</p>
      ) : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <TH>Bill</TH>
                <TH>Time</TH>
                <TH>Customer</TH>
                <TH className="text-right">Total</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {bills.map((bill) => (
                <TR key={bill.id}>
                  <TD className="font-semibold">#{bill.billNo}</TD>
                  <TD className="text-xs whitespace-nowrap">{formatDateTime(bill.completedAt)}</TD>
                  <TD>{bill.customerName}</TD>
                  <TD className="text-right">{formatRs(bill.total)}</TD>
                  <TD className="text-right">
                    <Button size="sm" variant="secondary" onClick={() => onReprint(bill.id)}>
                      <Printer className="size-4" aria-hidden /> Reprint
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}
    </Dialog>
  );
}

/** Asks how much of a meter / ml / gram item is being sold. */
export function QtyDialog({
  variant,
  onClose,
  onConfirm,
}: {
  variant: PosVariant | null;
  onClose: () => void;
  onConfirm: (qty: string) => void;
}) {
  const [qty, setQty] = useState("");
  const error = qty ? validateQty(variant?.unit ?? "PIECE", qty) : null;
  const confirmQty = () => {
    if (!qty || error) return;
    onConfirm(qty);
    setQty("");
  };
  return (
    <Dialog
      open={variant !== null}
      onClose={() => {
        setQty("");
        onClose();
      }}
      title={variant ? `${variant.name}${variant.label ? ` · ${variant.label}` : ""}` : ""}
      footer={
        <Button onClick={confirmQty} disabled={!qty || Boolean(error)}>
          Add to bill
        </Button>
      }
    >
      <label className="space-y-1 text-sm">
        <span className="block text-xs font-medium text-gray-600">
          How many {variant ? UNIT_LABELS[variant.unit].toLowerCase() : ""}? (
          {formatRs(variant?.price ?? 0)} each)
        </span>
        <Input
          autoFocus
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), confirmQty())}
          aria-invalid={error ? true : undefined}
        />
        {error ? <span className="block text-xs text-red-600">{error}</span> : null}
      </label>
    </Dialog>
  );
}
