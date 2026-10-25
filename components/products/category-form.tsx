"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2, X } from "lucide-react";
import { saveCategoryAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { normalizeCode, suggestAbbrev } from "@/lib/codes";
import type { CategoryInput } from "@/lib/schemas/catalog";
import { UNIT_LABELS, UNITS } from "@/lib/units";

type Option = { value: string; abbrev: string; abbrevEdited?: boolean };
type Attribute = {
  key: string;
  id?: string;
  name: string;
  type: "OPTION" | "TEXT";
  usedInCode: boolean;
  options: Option[];
  isNew?: boolean;
};

let nextKey = 0;
const newKey = () => `k${++nextKey}`;

export function CategoryForm({
  initial,
  productCount,
}: {
  initial: CategoryInput;
  productCount: number;
}) {
  const router = useRouter();
  const locked = productCount > 0;
  const [name, setName] = useState(initial.name);
  const [codePrefix, setCodePrefix] = useState(initial.codePrefix);
  const [defaultUnit, setDefaultUnit] = useState(initial.defaultUnit);
  const [isActive, setIsActive] = useState(initial.isActive);
  const [attributes, setAttributes] = useState<Attribute[]>(() =>
    initial.attributes.map((attribute) => ({
      ...attribute,
      key: newKey(),
      options: attribute.options.map((option) => ({ ...option, abbrevEdited: true })),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: string, change: Partial<Attribute>) =>
    setAttributes((list) => list.map((a) => (a.key === key ? { ...a, ...change } : a)));

  const move = (index: number, delta: number) =>
    setAttributes((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const save = () => {
    setError(null);
    const input: CategoryInput = {
      id: initial.id,
      name,
      codePrefix,
      defaultUnit,
      isActive,
      attributes: attributes.map(({ id, name, type, usedInCode, options }) => ({
        id,
        name,
        type,
        usedInCode,
        options: type === "OPTION" ? options.map(({ value, abbrev }) => ({ value, abbrev })) : [],
      })),
    };
    startTransition(async () => {
      const result = await saveCategoryAction(input);
      if (!result.ok) return setError(result.error);
      router.push("/products/categories");
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900">
          {initial.id ? "Edit category" : "New category"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Caps"
            required
            autoFocus={!initial.id}
          />
          <Field
            label="Code prefix"
            value={codePrefix}
            onChange={(e) => setCodePrefix(normalizeCode(e.target.value).slice(0, 4))}
            placeholder="CAP"
            hint={locked ? "Locked: products already use it" : "2-4 letters, starts every code"}
            disabled={locked}
            required
          />
          <div className="space-y-1">
            <label htmlFor="unit" className="block text-xs font-medium text-gray-600">
              Default unit
            </label>
            <Select
              id="unit"
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value as typeof defaultUnit)}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABELS[unit]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Checkbox
          label="Active (new products can use this category)"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Attributes</h2>
            <p className="text-sm text-gray-500">
              What varies inside this category, e.g. Color and Size. Attributes used in the code add
              their option code to every variant code, in this order.
            </p>
          </div>
          {!locked ? (
            <Button
              variant="secondary"
              onClick={() =>
                setAttributes((list) => [
                  ...list,
                  {
                    key: newKey(),
                    name: "",
                    type: "OPTION",
                    usedInCode: true,
                    options: [],
                    isNew: true,
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden /> Add attribute
            </Button>
          ) : null}
        </div>

        {locked ? (
          <Alert>
            <Lock className="mr-1.5 inline size-4" aria-hidden />
            This category has {productCount} product{productCount === 1 ? "" : "s"}, so its
            attributes are locked to keep codes consistent. You can still add options and edit
            option codes.
          </Alert>
        ) : null}

        {attributes.length === 0 ? (
          <p className="text-sm text-gray-500">
            No attributes: every product in this category has a single variant.
          </p>
        ) : null}

        {attributes.map((attribute, index) => (
          <AttributeEditor
            key={attribute.key}
            attribute={attribute}
            locked={locked}
            isFirst={index === 0}
            isLast={index === attributes.length - 1}
            onChange={(change) => update(attribute.key, change)}
            onMove={(delta) => move(index, delta)}
            onRemove={() => setAttributes((list) => list.filter((a) => a.key !== attribute.key))}
          />
        ))}
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save category"}
        </Button>
        <Link href="/products/categories" className={buttonClasses({ variant: "secondary" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function AttributeEditor({
  attribute,
  locked,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  attribute: Attribute;
  locked: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (change: Partial<Attribute>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const [newValue, setNewValue] = useState("");
  const structureLocked = locked && !attribute.isNew;

  const setOption = (index: number, change: Partial<Option>) =>
    onChange({
      options: attribute.options.map((option, i) =>
        i === index ? { ...option, ...change } : option,
      ),
    });

  const addOption = () => {
    const values = newValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .filter(
        (value) => !attribute.options.some((o) => o.value.toLowerCase() === value.toLowerCase()),
      );
    if (values.length === 0) return;
    onChange({
      options: [
        ...attribute.options,
        ...values.map((value) => ({ value, abbrev: suggestAbbrev(value) })),
      ],
    });
    setNewValue("");
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <Field
            label="Attribute name"
            value={attribute.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Color"
            disabled={structureLocked}
            required
          />
        </div>
        <div className="w-40 space-y-1">
          <label
            className="block text-xs font-medium text-gray-600"
            htmlFor={`${attribute.key}-type`}
          >
            Values
          </label>
          <Select
            id={`${attribute.key}-type`}
            value={attribute.type}
            disabled={structureLocked}
            onChange={(e) => onChange({ type: e.target.value as Attribute["type"] })}
          >
            <option value="OPTION">Fixed options</option>
            <option value="TEXT">Free text</option>
          </Select>
        </div>
        <Checkbox
          className="h-9"
          label="Used in code"
          checked={attribute.usedInCode}
          disabled={structureLocked}
          onChange={(e) => onChange({ usedInCode: e.target.checked })}
        />
        {!locked ? (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Move up"
              disabled={isFirst}
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Move down"
              disabled={isLast}
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Remove attribute" onClick={onRemove}>
              <Trash2 className="size-4 text-red-600" />
            </Button>
          </div>
        ) : null}
      </div>

      {attribute.type === "OPTION" ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Options and their codes</p>
          <div className="flex flex-wrap gap-2">
            {attribute.options.map((option, index) => (
              <div
                key={index}
                className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 py-1 pr-1 pl-3"
              >
                <span className="text-sm text-gray-800">{option.value}</span>
                <Input
                  aria-label={`Code for ${option.value}`}
                  value={option.abbrev}
                  onChange={(e) =>
                    setOption(index, {
                      abbrev: normalizeCode(e.target.value).slice(0, 8),
                      abbrevEdited: true,
                    })
                  }
                  className="h-8 w-20 font-mono text-xs"
                />
                <button
                  type="button"
                  aria-label={`Remove ${option.value}`}
                  onClick={() =>
                    onChange({ options: attribute.options.filter((_, i) => i !== index) })
                  }
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex max-w-md gap-2">
            <Input
              aria-label={`New ${attribute.name || "attribute"} options`}
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOption();
                }
              }}
              placeholder="Add options, e.g. Black, White, Grey"
            />
            <Button variant="secondary" onClick={addOption}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Typed in for each variant (e.g. a volume like &quot;6 ml&quot;). Its code is the value in
          capitals without spaces.
        </p>
      )}
    </div>
  );
}
