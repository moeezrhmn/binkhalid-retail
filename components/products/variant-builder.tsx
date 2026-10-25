"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { addCategoryOptionAction } from "@/app/(app)/(admin)/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { normalizeCode, previewVariantCode, suggestAbbrev, type CodeAttribute } from "@/lib/codes";
import { combinations, variantKey, variantLabel } from "@/lib/variants";

export type BuilderAttribute = {
  id?: string;
  name: string;
  type: "OPTION" | "TEXT";
  usedInCode: boolean;
  sortOrder: number;
  options: { value: string; abbrev: string }[];
};

export type RowValues = {
  include: boolean;
  costPrice: string;
  salePrice: string;
  openingStock: string;
  minStock: string;
};

export type BuilderRow = RowValues & {
  key: string;
  values: Record<string, string>;
  label: string;
  code: string;
};

export type Selections = Record<string, string[]>;

export const EMPTY_ROW: RowValues = {
  include: true,
  costPrice: "",
  salePrice: "",
  openingStock: "0",
  minStock: "0",
};

export const MAX_ROWS = 200;

function codeAttributes(attributes: BuilderAttribute[]): CodeAttribute[] {
  return attributes.map((attribute) => ({
    name: attribute.name,
    type: attribute.type,
    usedInCode: attribute.usedInCode,
    sortOrder: attribute.sortOrder,
    codeAbbrevs: Object.fromEntries(attribute.options.map((o) => [o.value, o.abbrev])),
  }));
}

/** All rows for the current selections, minus combinations the product already has. */
export function buildRows(
  prefix: string,
  attributes: BuilderAttribute[],
  selections: Selections,
  rowValues: Record<string, RowValues>,
  existingKeys: ReadonlySet<string> = new Set(),
): BuilderRow[] {
  const sets = combinations(
    attributes.map((attribute) => ({
      name: attribute.name,
      values: selections[attribute.name] ?? [],
    })),
  );
  const forCode = codeAttributes(attributes);
  return sets
    .map((values) => {
      const key = variantKey(values);
      return {
        ...(rowValues[key] ?? EMPTY_ROW),
        key,
        values,
        label: variantLabel(values, attributes) || "Single variant",
        code: previewVariantCode({ prefix, attributes: forCode, values }),
      };
    })
    .filter((row) => !existingKeys.has(row.key));
}

export function VariantBuilder({
  prefix,
  attributes,
  selections,
  onSelectionsChange,
  rowValues,
  onRowValuesChange,
  onOptionAdded,
  existingKeys,
  showOpeningStock = true,
}: {
  prefix: string;
  attributes: BuilderAttribute[];
  selections: Selections;
  onSelectionsChange: (selections: Selections) => void;
  rowValues: Record<string, RowValues>;
  onRowValuesChange: (rowValues: Record<string, RowValues>) => void;
  onOptionAdded: (attributeName: string, option: { value: string; abbrev: string }) => void;
  existingKeys?: ReadonlySet<string>;
  showOpeningStock?: boolean;
}) {
  const rows = buildRows(prefix, attributes, selections, rowValues, existingKeys);
  const hiddenExisting = existingKeys
    ? combinations(
        attributes.map((a) => ({ name: a.name, values: selections[a.name] ?? [] })),
      ).filter((values) => existingKeys.has(variantKey(values))).length
    : 0;

  const setRow = (key: string, change: Partial<RowValues>) =>
    onRowValuesChange({ ...rowValues, [key]: { ...(rowValues[key] ?? EMPTY_ROW), ...change } });

  return (
    <div className="space-y-5">
      {attributes.map((attribute) => (
        <OptionPicker
          key={attribute.name}
          attribute={attribute}
          selected={selections[attribute.name] ?? []}
          onChange={(values) => onSelectionsChange({ ...selections, [attribute.name]: values })}
          onOptionAdded={(option) => {
            onOptionAdded(attribute.name, option);
            onSelectionsChange({
              ...selections,
              [attribute.name]: [...(selections[attribute.name] ?? []), option.value],
            });
          }}
        />
      ))}

      {rows.length > MAX_ROWS ? (
        <p className="text-sm text-red-600">
          {rows.length} variants is too many at once. Save at most {MAX_ROWS}.
        </p>
      ) : null}

      <FillAll
        showOpeningStock={showOpeningStock}
        onApply={(values) => {
          const next = { ...rowValues };
          for (const row of rows) next[row.key] = { ...(next[row.key] ?? EMPTY_ROW), ...values };
          onRowValuesChange(next);
        }}
      />

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <Table>
          <THead>
            <tr>
              <TH className="w-10">
                <span className="sr-only">Include</span>
              </TH>
              <TH>Variant</TH>
              <TH>Code</TH>
              <TH>Cost (Rs)</TH>
              <TH>Sale price (Rs)</TH>
              {showOpeningStock ? <TH>Opening stock</TH> : null}
              <TH>Min stock</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.key} className={cn(!row.include && "opacity-50")}>
                <TD>
                  <input
                    type="checkbox"
                    aria-label={`Include ${row.label}`}
                    checked={row.include}
                    onChange={(e) => setRow(row.key, { include: e.target.checked })}
                    className="size-4 accent-brand-700"
                  />
                </TD>
                <TD className="font-medium whitespace-nowrap">{row.label}</TD>
                <TD className="font-mono text-xs whitespace-nowrap text-gray-600">{row.code}</TD>
                {(
                  [
                    "costPrice",
                    "salePrice",
                    ...(showOpeningStock ? ["openingStock"] : []),
                    "minStock",
                  ] as const
                ).map((field) => (
                  <TD key={field} className="py-2">
                    <Input
                      aria-label={`${row.label} ${field}`}
                      inputMode="decimal"
                      value={row[field as keyof RowValues] as string}
                      disabled={!row.include}
                      onChange={(e) => setRow(row.key, { [field]: e.target.value })}
                      className="h-8 w-24"
                    />
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
      {hiddenExisting > 0 ? (
        <p className="text-sm text-gray-500">
          {hiddenExisting} combination{hiddenExisting === 1 ? "" : "s"} already exist
          {hiddenExisting === 1 ? "s" : ""} and {hiddenExisting === 1 ? "is" : "are"} hidden.
        </p>
      ) : null}
    </div>
  );
}

function OptionPicker({
  attribute,
  selected,
  onChange,
  onOptionAdded,
}: {
  attribute: BuilderAttribute;
  selected: string[];
  onChange: (values: string[]) => void;
  onOptionAdded: (option: { value: string; abbrev: string }) => void;
}) {
  const [value, setValue] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [abbrevEdited, setAbbrevEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isText = attribute.type === "TEXT";
  const choices = isText ? selected : attribute.options.map((option) => option.value);

  const toggle = (option: string) =>
    onChange(
      selected.includes(option)
        ? selected.filter((v) => v !== option)
        : choices.filter((v) => v === option || selected.includes(v)),
    );

  const add = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setError(null);
    if (isText) {
      if (!selected.some((v) => v.toLowerCase() === trimmed.toLowerCase()))
        onChange([...selected, trimmed]);
      setValue("");
      return;
    }
    if (!attribute.id) return;
    startTransition(async () => {
      const result = await addCategoryOptionAction({
        attributeId: attribute.id!,
        value: trimmed,
        abbrev: abbrev || suggestAbbrev(trimmed),
      });
      if (!result.ok) return setError(result.error);
      onOptionAdded(result.data);
      setValue("");
      setAbbrev("");
      setAbbrevEdited(false);
    });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="flex w-full items-center justify-between text-sm font-medium text-gray-700">
        <span>{attribute.name}</span>
        {!isText && choices.length > 0 ? (
          <span className="flex gap-3 text-xs font-normal">
            <button
              type="button"
              className="text-brand-700 hover:underline"
              onClick={() => onChange(choices)}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-gray-500 hover:underline"
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </span>
        ) : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors",
                on
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-brand-600",
              )}
            >
              {on ? <Check className="size-3.5" aria-hidden /> : null}
              {option}
            </button>
          );
        })}
      </div>
      <div className="flex max-w-lg flex-wrap gap-2">
        <Input
          aria-label={`New ${attribute.name}`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (!abbrevEdited) setAbbrev(suggestAbbrev(e.target.value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={
            isText
              ? `Type a ${attribute.name.toLowerCase()} and press Enter`
              : `New ${attribute.name.toLowerCase()}`
          }
          className="h-8 min-w-40 flex-1"
        />
        {!isText ? (
          <Input
            aria-label={`Code for new ${attribute.name}`}
            value={abbrev}
            onChange={(e) => {
              setAbbrev(normalizeCode(e.target.value).slice(0, 8));
              setAbbrevEdited(true);
            }}
            placeholder="Code"
            className="h-8 w-24 font-mono text-xs"
          />
        ) : null}
        <Button variant="secondary" size="sm" onClick={add} disabled={pending || !value.trim()}>
          <Plus className="size-4" aria-hidden /> {isText ? "Add" : "Add option"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </fieldset>
  );
}

function FillAll({
  showOpeningStock,
  onApply,
}: {
  showOpeningStock: boolean;
  onApply: (values: Partial<RowValues>) => void;
}) {
  const [values, setValues] = useState({
    costPrice: "",
    salePrice: "",
    openingStock: "",
    minStock: "",
  });
  const fields = [
    ["costPrice", "Cost (Rs)"],
    ["salePrice", "Sale price (Rs)"],
    ...(showOpeningStock ? [["openingStock", "Opening stock"]] : []),
    ["minStock", "Min stock"],
  ] as [keyof typeof values, string][];

  const apply = () => {
    const filled = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() !== ""));
    if (Object.keys(filled).length > 0) onApply(filled);
  };

  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="mb-2 text-sm font-medium text-gray-700">Fill all rows</p>
      <div className="flex flex-wrap items-end gap-2">
        {fields.map(([field, label]) => (
          <label key={field} className="space-y-1 text-xs text-gray-600">
            <span className="block">{label}</span>
            <Input
              inputMode="decimal"
              value={values[field]}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
              }}
              className="h-8 w-28"
            />
          </label>
        ))}
        <Button variant="secondary" size="sm" className="h-8" onClick={apply}>
          Apply to all
        </Button>
      </div>
    </div>
  );
}

/** Variants ready for the server, or an error to show. */
export function rowsToVariants(rows: BuilderRow[]) {
  const included = rows.filter((row) => row.include);
  if (included.length === 0) return { error: "Select at least one variant" } as const;
  if (included.length > MAX_ROWS)
    return { error: `Save at most ${MAX_ROWS} variants at a time` } as const;
  const missingPrice = included.find((row) => row.salePrice.trim() === "");
  if (missingPrice) return { error: `Enter a sale price for ${missingPrice.label}` } as const;
  return {
    variants: included.map((row) => ({
      values: row.values,
      costPrice: row.costPrice.trim() || "0",
      salePrice: row.salePrice,
      openingStock: row.openingStock.trim() || "0",
      minStock: row.minStock.trim() || "0",
    })),
  } as const;
}

/** Selections that reproduce a list of existing variants (used to duplicate a product). */
export function selectionsFrom(
  attributes: BuilderAttribute[],
  variants: { values: Record<string, string> }[],
) {
  const selections: Selections = {};
  for (const attribute of attributes) {
    const order = attribute.options.map((o) => o.value);
    const used = new Set(variants.map((v) => v.values[attribute.name]).filter(Boolean));
    selections[attribute.name] =
      attribute.type === "OPTION" ? order.filter((v) => used.has(v)) : [...used];
  }
  return selections;
}
