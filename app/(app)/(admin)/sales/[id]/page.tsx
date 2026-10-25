import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { METHOD_LABELS } from "@/lib/cart";
import { formatDateTime, formatQty, formatRs } from "@/lib/format";
import { getSaleDetail } from "@/server/services/sales-history";

export const metadata: Metadata = { title: "Bill" };

export default async function BillPage({ params }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  const sale = /^[0-9a-f-]{36}$/.test(id) ? await getSaleDetail(id) : null;
  if (!sale) notFound();
  const canReturn = sale.items.some((item) => Number(item.returnableQty) > 0);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-gray-900">Bill #{sale.billNo}</h2>
          <p className="text-sm text-gray-600">
            {formatDateTime(sale.completedAt)} · {sale.customer?.name}
            {sale.customer?.phone ? ` (${sale.customer.phone})` : ""} · Served by {sale.userName}
          </p>
          {sale.exchangedFrom ? (
            <p className="text-sm text-gold-600">
              Exchange for{" "}
              <Link href={`/sales/${sale.exchangedFrom.id}`} className="underline">
                bill #{sale.exchangedFrom.billNo}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <a
            href={`/print/receipt/${sale.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClasses({ variant: "secondary" })}
          >
            <Printer className="size-4" aria-hidden /> Reprint receipt
          </a>
          {canReturn ? (
            <Link href={`/sales/${sale.id}/return`} className={buttonClasses()}>
              <Undo2 className="size-4" aria-hidden /> Return or exchange
            </Link>
          ) : null}
        </div>
      </Card>

      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Price</TH>
              <TH className="text-right">Line discount</TH>
              <TH className="text-right">Bill discount share</TH>
              <TH className="text-right">Paid</TH>
              <TH className="text-right">Returned</TH>
            </tr>
          </THead>
          <TBody>
            {sale.items.map((item) => (
              <TR key={item.id}>
                <TD>
                  <div className="font-medium">{item.name}</div>
                  <div className="font-mono text-xs text-gray-400">{item.code}</div>
                </TD>
                <TD className="text-right">{formatQty(item.qty)}</TD>
                <TD className="text-right">{formatRs(item.price)}</TD>
                <TD className="text-right text-gray-600">
                  {item.discount ? `− ${formatRs(item.discount)}` : "—"}
                </TD>
                <TD className="text-right text-gray-600">
                  {item.billDiscountShare ? `− ${formatRs(item.billDiscountShare)}` : "—"}
                </TD>
                <TD className="text-right font-semibold">{formatRs(item.netTotal)}</TD>
                <TD className="text-right">
                  {Number(item.returnedQty) > 0 ? formatQty(item.returnedQty) : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="space-y-1 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span>{formatRs(sale.subtotal)}</span>
          </div>
          {sale.discount ? (
            <div className="flex justify-between">
              <span className="text-gray-600">Bill discount</span>
              <span>− {formatRs(sale.discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatRs(sale.total)}</span>
          </div>
          <div className="mt-2 border-t border-gray-100 pt-2">
            {sale.payments.map((payment, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-gray-600">
                  {payment.amount < 0
                    ? "Exchange difference given back (cash)"
                    : METHOD_LABELS[payment.method]}
                </span>
                <span>{formatRs(Math.abs(payment.amount))}</span>
              </div>
            ))}
            {sale.cashReceived !== null ? (
              <div className="flex justify-between text-gray-500">
                <span>Cash received / change</span>
                <span>
                  {formatRs(sale.cashReceived)} / {formatRs(sale.changeGiven ?? 0)}
                </span>
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="p-4 text-sm">
          <h3 className="mb-2 font-semibold text-gray-900">Returns and exchanges</h3>
          {sale.returns.length === 0 ? (
            <p className="text-gray-500">None.</p>
          ) : (
            <ul className="space-y-1.5">
              {sale.returns.map((ret) => (
                <li key={ret.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <Badge tone={ret.type === "EXCHANGE" ? "blue" : "gold"}>
                      {ret.type === "EXCHANGE" ? "Exchange" : "Return"} #{ret.returnNo}
                    </Badge>{" "}
                    <span className="text-gray-600">{formatDateTime(ret.createdAt)}</span>
                  </span>
                  <span>
                    {formatRs(ret.refundAmount)}{" "}
                    <span className="text-gray-500">
                      ({ret.methods.map((m) => METHOD_LABELS[m.method]).join(", ")})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
