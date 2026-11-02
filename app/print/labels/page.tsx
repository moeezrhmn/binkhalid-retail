import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth";
import { printerBarcode, printerQrCode } from "@/lib/barcode";
import { formatRs } from "@/lib/format";
import { MAX_LABEL_COPIES, MAX_LABEL_ITEMS } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { labelVariantsByIds } from "@/server/services/labels";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Print labels" };

/** items=<variantId>:<copies>,<variantId>:<copies>,… */
function parseItems(value: string | string[] | undefined) {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .slice(0, MAX_LABEL_ITEMS)
    .flatMap((part) => {
      const [id, copies] = part.split(":");
      const count = Math.min(Number(copies) || 0, MAX_LABEL_COPIES);
      return /^[0-9a-f-]{36}$/.test(id) && count > 0 ? [{ id, count }] : [];
    });
}

export default async function PrintLabelsPage({ searchParams }: PageProps<"/print/labels">) {
  await requireAdmin();
  const items = parseItems((await searchParams).items);
  const [settings, variants] = await Promise.all([
    getSettings(),
    labelVariantsByIds(items.map((item) => item.id)),
  ]);

  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const labels = items.flatMap(({ id, count }) => {
    const variant = byId.get(id);
    return variant ? Array.from({ length: count }, () => variant) : [];
  });
  const width = settings.labelWidthMm;
  const height = settings.labelHeightMm;
  const useQr = settings.labelCodeType !== "barcode";
  // The QR code takes the right of the label: up to a third of its width and its
  // full height inside the 1.2 mm top and bottom padding.
  const qrMaxMm = Math.min(width * 0.34, height - 2.4);
  const codes = new Map(
    variants.map((variant) => [
      variant.id,
      useQr
        ? { qr: printerQrCode(variant.code, settings.labelDpi, qrMaxMm) }
        : { barcode: printerBarcode(variant.code, settings.labelDpi, width) },
    ]),
  );

  return (
    <>
      <style>{`
        @page { size: ${width}mm ${height}mm; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .print-toolbar { display: none !important; }
          .label-sheet { display: block !important; padding: 0 !important; gap: 0 !important; }
          .label { box-shadow: none !important; margin: 0 !important; break-after: page; }
        }
        .label { width: ${width}mm; height: ${height}mm; }
        .label svg { width: 100%; height: 100%; display: block; }
      `}</style>

      <div className="print-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <PrintButton autoFocus />
        <Link href="/barcodes" className={buttonClasses({ variant: "secondary" })}>
          Back
        </Link>
        <p className="text-sm text-gray-600">
          {labels.length} label{labels.length === 1 ? "" : "s"}, {width} × {height} mm, one per
          page. In the print dialog pick the label printer and set margins to None.
        </p>
      </div>

      <div className="label-sheet flex flex-wrap gap-4 bg-gray-100 p-6">
        {labels.map((variant, index) => {
          const { qr, barcode } = codes.get(variant.id)!;
          return qr ? (
            <div
              key={`${variant.id}-${index}`}
              className="label flex overflow-hidden bg-white text-black shadow"
              style={{
                padding: "1.2mm 2mm",
                gap: "1.5mm",
                fontFamily: "Arial, Helvetica, sans-serif",
              }}
            >
              <div className="flex min-w-0 flex-1 flex-col" style={{ lineHeight: 1.15 }}>
                <div className="truncate" style={{ fontSize: "2.2mm" }}>
                  {settings.shopName}
                </div>
                <div className="line-clamp-2 font-bold" style={{ fontSize: "2.8mm" }}>
                  {variant.productName}
                </div>
                <div className="truncate" style={{ fontSize: "2.3mm" }}>
                  {variant.variantText}
                </div>
                <div className="mt-auto font-bold" style={{ fontSize: "3.6mm" }}>
                  {formatRs(variant.salePrice)}
                </div>
                <div className="truncate font-mono" style={{ fontSize: "2.2mm" }}>
                  {variant.code}
                </div>
              </div>
              {/* Exactly its size, so every square stays on whole printer dots. */}
              <div
                className="shrink-0 self-center"
                style={{ width: `${qr.sizeMm}mm`, height: `${qr.sizeMm}mm` }}
                dangerouslySetInnerHTML={{ __html: qr.svg }}
              />
            </div>
          ) : (
            <div
              key={`${variant.id}-${index}`}
              className="label flex flex-col overflow-hidden bg-white text-black shadow"
              style={{ padding: "1.2mm 2mm", fontFamily: "Arial, Helvetica, sans-serif" }}
            >
              <div className="flex items-baseline justify-between" style={{ fontSize: "2.2mm" }}>
                <span className="truncate">{settings.shopName}</span>
                <span className="font-bold" style={{ fontSize: "3.4mm" }}>
                  {formatRs(variant.salePrice)}
                </span>
              </div>
              <div className="truncate font-bold" style={{ fontSize: "2.8mm", lineHeight: 1.15 }}>
                {variant.productName}
              </div>
              <div className="truncate" style={{ fontSize: "2.3mm", lineHeight: 1.15 }}>
                {variant.variantText || " "}
              </div>
              {/* From the label's left edge (cancelling the 2 mm padding), exactly the
                barcode's width, so the bars stay on the printer's dots. */}
              <div
                className="min-h-0 flex-1 self-start"
                style={{ margin: "0.6mm 0 0.6mm -2mm", width: `${barcode!.widthMm}mm` }}
                dangerouslySetInnerHTML={{ __html: barcode!.svg }}
              />
              <div
                className="text-center font-mono"
                style={{ fontSize: "2.4mm", letterSpacing: "0.1mm" }}
              >
                {variant.code}
              </div>
            </div>
          );
        })}
        {labels.length === 0 ? (
          <p className="text-sm text-gray-600">Nothing to print. Go back and pick some variants.</p>
        ) : null}
      </div>
    </>
  );
}
