import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { METHOD_LABELS } from "@/lib/cart";
import { formatDateTime, formatQty, formatRs } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { getReceipt } from "@/server/services/receipts";
import { PrintButton } from "@/components/print-button";
import { AutoPrint } from "./auto-print";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
  searchParams,
}: PageProps<"/print/receipt/[id]">) {
  await requireUser();
  const { id } = await params;
  const { auto } = await searchParams;
  const [settings, receipt] = await Promise.all([
    getSettings(),
    /^[0-9a-f-]{36}$/.test(id) ? getReceipt(id) : null,
  ]);
  if (!receipt) notFound();

  const width = settings.receiptWidthMm;
  const row = "flex justify-between gap-2";

  return (
    <>
      <style>{`
        @page { size: ${width}mm auto; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .receipt-toolbar { display: none !important; }
          .receipt-sheet { padding: 0 !important; background: #fff !important; }
          .receipt { box-shadow: none !important; margin: 0 !important; }
        }
        .receipt { width: ${width}mm; }
      `}</style>
      {auto === "1" ? <AutoPrint /> : null}

      <div className="receipt-toolbar flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <PrintButton autoFocus />
        <p className="text-sm text-gray-600">
          Bill #{receipt.billNo}. Pick the receipt printer and set margins to None.
        </p>
      </div>

      <div className="receipt-sheet flex justify-center bg-gray-100 p-6">
        <div
          className="receipt bg-white text-black shadow"
          style={{
            padding: "3mm 3.5mm",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontSize: "3mm",
            lineHeight: 1.35,
          }}
        >
          <div className="text-center">
            <div className="font-bold" style={{ fontSize: "4.6mm" }}>
              {settings.shopName}
            </div>
            {settings.shopAddress ? <div>{settings.shopAddress}</div> : null}
            {settings.shopPhone ? <div>Ph: {settings.shopPhone}</div> : null}
            {settings.receiptHeader ? <div>{settings.receiptHeader}</div> : null}
          </div>

          <div className="my-1.5 border-t border-dashed border-black" />
          <div className={row}>
            <span className="font-bold">Bill #{receipt.billNo}</span>
            <span>{formatDateTime(receipt.completedAt)}</span>
          </div>
          {receipt.customer ? (
            <div>
              Customer: {receipt.customer.name}
              {receipt.customer.phone ? ` (${receipt.customer.phone})` : ""}
            </div>
          ) : null}
          <div>Served by: {receipt.cashier}</div>
          <div className="my-1.5 border-t border-dashed border-black" />

          {receipt.items.map((item, index) => (
            <div key={index} className="mb-1">
              <div className="font-semibold">{item.name}</div>
              <div className={row}>
                <span>
                  {formatQty(item.qty)} × {formatRs(item.price)}
                  {item.discount > 0 ? ` − ${formatRs(item.discount)}` : ""}
                </span>
                <span>{formatRs(item.lineTotal)}</span>
              </div>
            </div>
          ))}

          <div className="my-1.5 border-t border-dashed border-black" />
          <div className={row}>
            <span>Subtotal</span>
            <span>{formatRs(receipt.subtotal)}</span>
          </div>
          {receipt.discount > 0 ? (
            <div className={row}>
              <span>Discount</span>
              <span>− {formatRs(receipt.discount)}</span>
            </div>
          ) : null}
          <div className={`${row} font-bold`} style={{ fontSize: "4mm" }}>
            <span>TOTAL</span>
            <span>{formatRs(receipt.total)}</span>
          </div>
          <div className="my-1.5 border-t border-dashed border-black" />

          {receipt.payments.map((payment, index) => (
            <div key={index} className={row}>
              <span>
                {payment.amount < 0 ? "Exchange refund (cash)" : METHOD_LABELS[payment.method]}
              </span>
              <span>{formatRs(Math.abs(payment.amount))}</span>
            </div>
          ))}
          {receipt.cashReceived !== null ? (
            <>
              <div className={row}>
                <span>Cash received</span>
                <span>{formatRs(receipt.cashReceived)}</span>
              </div>
              <div className={`${row} font-bold`}>
                <span>Change</span>
                <span>{formatRs(receipt.changeGiven ?? 0)}</span>
              </div>
            </>
          ) : null}
          {receipt.udhaarBalance !== null ? (
            <div className={`${row} mt-1 font-bold`}>
              <span>Udhaar balance</span>
              <span>{formatRs(receipt.udhaarBalance)}</span>
            </div>
          ) : null}

          {settings.receiptFooter ? (
            <>
              <div className="my-1.5 border-t border-dashed border-black" />
              <div className="text-center">{settings.receiptFooter}</div>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}
