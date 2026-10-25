"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addVariantsAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildRows,
  rowsToVariants,
  VariantBuilder,
  type BuilderAttribute,
  type RowValues,
  type Selections,
} from "./variant-builder";

export function AddVariants({
  productId,
  prefix,
  attributes: initialAttributes,
  existingKeys,
}: {
  productId: string;
  prefix: string;
  attributes: BuilderAttribute[];
  existingKeys: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [attributes, setAttributes] = useState(initialAttributes);
  const [selections, setSelections] = useState<Selections>({});
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const existing = new Set(existingKeys);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add variants
      </Button>
    );
  }

  const save = () => {
    setError(null);
    const built = rowsToVariants(buildRows(prefix, attributes, selections, rowValues, existing));
    if ("error" in built) return setError(built.error ?? "Check the variants");
    startTransition(async () => {
      const result = await addVariantsAction(productId, built.variants);
      if (!result.ok) return setError(result.error);
      setOpen(false);
      setSelections({});
      setRowValues({});
      router.refresh();
    });
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Add variants</h2>
        <p className="text-sm text-gray-500">
          Pick options to add. Combinations this product already has are left out.
        </p>
      </div>
      <VariantBuilder
        prefix={prefix}
        attributes={attributes}
        selections={selections}
        onSelectionsChange={setSelections}
        rowValues={rowValues}
        onRowValuesChange={setRowValues}
        existingKeys={existing}
        onOptionAdded={(name, option) =>
          setAttributes((list) =>
            list.map((a) => (a.name === name ? { ...a, options: [...a.options, option] } : a)),
          )
        }
      />
      {error ? (
        <Alert tone="error" className="whitespace-pre-line">
          {error}
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save new variants"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
