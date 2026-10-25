import type { Metadata } from "next";
import { LabelBuilder } from "@/components/barcodes/label-builder";
import { PageHeader } from "@/components/page-header";
import { MAX_LABEL_COPIES, MAX_LABEL_ITEMS } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { labelVariantsAddedToday, labelVariantsByIds } from "@/server/services/labels";

export const metadata: Metadata = { title: "Barcode Labels" };

const UUID = /^[0-9a-f-]{36}$/;

/** variants=id,id (1 copy each) or items=id:copies,id:copies (e.g. after stock in). */
function parseRequested(variants: unknown, items: unknown) {
  const requested = new Map<string, number>();
  if (typeof variants === "string") {
    for (const id of variants.split(",")) if (UUID.test(id)) requested.set(id, 1);
  }
  if (typeof items === "string") {
    for (const part of items.split(",")) {
      const [id, copies] = part.split(":");
      const count = Math.min(Math.max(Number(copies) || 1, 1), MAX_LABEL_COPIES);
      if (UUID.test(id)) requested.set(id, count);
    }
  }
  return [...requested].slice(0, MAX_LABEL_ITEMS);
}

export default async function BarcodesPage({ searchParams }: PageProps<"/barcodes">) {
  const { variants, items, today } = await searchParams;
  const requested = parseRequested(variants, items);
  const ids = requested.map(([id]) => id);
  const copies = new Map(requested);

  const [settings, picked, added] = await Promise.all([
    getSettings(),
    labelVariantsByIds(ids),
    today === "1" ? labelVariantsAddedToday() : [],
  ]);

  const initial = [
    ...picked.map((variant) => ({ variant, copies: copies.get(variant.id) ?? 1 })),
    ...added
      .filter((variant) => !copies.has(variant.id))
      .map((variant) => ({ variant, copies: variant.suggestedCopies })),
  ].slice(0, MAX_LABEL_ITEMS);

  return (
    <>
      <PageHeader
        title="Barcode Labels"
        description="Pick variants and the number of labels, then preview and print."
      />
      <LabelBuilder
        initial={initial}
        labelSize={`${settings.labelWidthMm} × ${settings.labelHeightMm} mm`}
      />
    </>
  );
}
