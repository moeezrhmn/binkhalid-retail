import type { Metadata } from "next";
import { LabelBuilder } from "@/components/barcodes/label-builder";
import { PageHeader } from "@/components/page-header";
import { MAX_LABEL_ITEMS } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { labelVariantsAddedToday, labelVariantsByIds } from "@/server/services/labels";

export const metadata: Metadata = { title: "Barcode Labels" };

const UUID = /^[0-9a-f-]{36}$/;

export default async function BarcodesPage({ searchParams }: PageProps<"/barcodes">) {
  const { variants, today } = await searchParams;
  const ids =
    typeof variants === "string"
      ? variants
          .split(",")
          .filter((id) => UUID.test(id))
          .slice(0, MAX_LABEL_ITEMS)
      : [];

  const [settings, picked, added] = await Promise.all([
    getSettings(),
    labelVariantsByIds(ids),
    today === "1" ? labelVariantsAddedToday() : [],
  ]);

  const initial = [
    ...picked.map((variant) => ({ variant, copies: 1 })),
    ...added
      .filter((variant) => !ids.includes(variant.id))
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
