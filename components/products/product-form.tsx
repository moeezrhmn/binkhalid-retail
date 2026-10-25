"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProductAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_LABELS, UNITS, type UnitCode } from "@/lib/units";
import { variantKey } from "@/lib/variants";
import { DiscountFields, ImageField } from "./product-fields";
import {
  buildRows,
  EMPTY_ROW,
  rowsToVariants,
  selectionsFrom,
  VariantBuilder,
  type BuilderAttribute,
  type RowValues,
  type Selections,
} from "./variant-builder";

export type FormCategory = {
  id: string;
  name: string;
  codePrefix: string;
  defaultUnit: UnitCode;
  attributes: BuilderAttribute[];
};

export type ProductDraft = {
  categoryId: string;
  name: string;
  description: string;
  unit: UnitCode;
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: number | null;
  variants: {
    values: Record<string, string>;
    costPrice: number;
    salePrice: number;
    openingStock: string;
    minStock: string;
  }[];
};

function startingState(category: FormCategory | undefined, draft?: ProductDraft) {
  if (!category || !draft)
    return { selections: {} as Selections, rowValues: {} as Record<string, RowValues> };
  const selections = selectionsFrom(category.attributes, draft.variants);
  const rowValues: Record<string, RowValues> = {};
  // Combinations the original product did not have start unticked.
  for (const row of buildRows(category.codePrefix, category.attributes, selections, {})) {
    rowValues[row.key] = { ...EMPTY_ROW, include: false };
  }
  for (const variant of draft.variants) {
    rowValues[variantKey(variant.values)] = {
      include: true,
      costPrice: String(variant.costPrice),
      salePrice: String(variant.salePrice),
      openingStock: variant.openingStock,
      minStock: variant.minStock,
    };
  }
  return { selections, rowValues };
}

export function ProductForm({
  categories: initialCategories,
  initialCategoryId,
  draft,
}: {
  categories: FormCategory[];
  initialCategoryId?: string;
  draft?: ProductDraft;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [categoryId, setCategoryId] = useState(
    draft?.categoryId ??
      initialCategories.find((c) => c.id === initialCategoryId)?.id ??
      initialCategories[0]?.id ??
      "",
  );
  const category = categories.find((c) => c.id === categoryId);
  const start = startingState(category, draft);

  const [name, setName] = useState(draft?.name ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [unit, setUnit] = useState<UnitCode>(draft?.unit ?? category?.defaultUnit ?? "PIECE");
  const [discount, setDiscount] = useState({
    discountType: draft?.discountType ?? null,
    discountValue: draft?.discountValue ? String(draft.discountValue) : "",
  });
  const [image, setImage] = useState<File | null>(null);
  const [selections, setSelections] = useState<Selections>(start.selections);
  const [rowValues, setRowValues] = useState<Record<string, RowValues>>(start.rowValues);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: string; name: string; count: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const nameRef = useRef<HTMLInputElement>(null);
  const [imageKey, setImageKey] = useState(0);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const rows = category
    ? buildRows(category.codePrefix, category.attributes, selections, rowValues)
    : [];

  const changeCategory = (id: string) => {
    const next = categories.find((c) => c.id === id);
    setCategoryId(id);
    if (next) setUnit(next.defaultUnit);
    setSelections({});
    setRowValues({});
  };

  const save = (addAnother: boolean) => {
    setError(null);
    setSaved(null);
    if (!category) return setError("Pick a category");
    if (!name.trim()) return setError("Enter the product name");
    const built = rowsToVariants(rows);
    if ("error" in built) return setError(built.error ?? "Check the variants");

    const formData = new FormData();
    formData.set(
      "data",
      JSON.stringify({
        categoryId,
        name,
        description,
        unit,
        discountType: discount.discountType,
        discountValue: discount.discountType ? discount.discountValue : null,
        variants: built.variants,
      }),
    );
    if (image) formData.set("image", image);

    startTransition(async () => {
      const result = await createProductAction(formData);
      if (!result.ok) return setError(result.error);
      if (!addAnother) return router.push(`/products/${result.data.id}`);

      setSaved({ id: result.data.id, name, count: result.data.codes.length });
      setName("");
      setDescription("");
      setDiscount({ discountType: null, discountValue: "" });
      setImage(null);
      setImageKey((key) => key + 1);
      setSelections({});
      setRowValues({});
      nameRef.current?.focus();
    });
  };

  if (categories.length === 0) {
    return (
      <Alert>
        Create a category first.{" "}
        <Link href="/products/categories/new" className="font-medium underline">
          New category
        </Link>
      </Alert>
    );
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        save(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          save(false);
        }
      }}
    >
      {saved ? (
        <Alert tone="success">
          Saved <strong>{saved.name}</strong> with {saved.count} variant
          {saved.count === 1 ? "" : "s"}.{" "}
          <Link href={`/products/${saved.id}`} className="font-medium underline">
            View product
          </Link>
        </Alert>
      ) : null}

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="category" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <Select
              id="category"
              value={categoryId}
              onChange={(e) => changeCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.codePrefix})
                </option>
              ))}
            </Select>
          </div>
          <Field
            ref={nameRef}
            label="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Velvet Prayer Cap"
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="unit" className="block text-sm font-medium text-gray-700">
              Sold by
            </label>
            <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as UnitCode)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DiscountFields value={discount} onChange={setDiscount} />
          <ImageField key={imageKey} onChange={setImage} />
        </div>
      </Card>

      {category ? (
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Variants</h2>
            <p className="text-sm text-gray-500">
              {category.attributes.length
                ? "Pick the options this product comes in. Every combination becomes a variant with its own code, price and stock. Leave everything unpicked for a single variant."
                : "Products in this category have a single variant."}
            </p>
          </div>
          <VariantBuilder
            prefix={category.codePrefix}
            attributes={category.attributes}
            selections={selections}
            onSelectionsChange={setSelections}
            rowValues={rowValues}
            onRowValuesChange={setRowValues}
            onOptionAdded={(attributeName, option) =>
              setCategories((list) =>
                list.map((c) =>
                  c.id !== categoryId
                    ? c
                    : {
                        ...c,
                        attributes: c.attributes.map((a) =>
                          a.name === attributeName ? { ...a, options: [...a.options, option] } : a,
                        ),
                      },
                ),
              )
            }
          />
        </Card>
      ) : null}

      {error ? (
        <Alert tone="error" className="whitespace-pre-line">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save product"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => save(true)}>
          Save and add another
        </Button>
        <Link href="/products" className={buttonClasses({ variant: "ghost" })}>
          Cancel
        </Link>
        <span className="text-xs text-gray-400">Ctrl + Enter saves</span>
      </div>
    </form>
  );
}
