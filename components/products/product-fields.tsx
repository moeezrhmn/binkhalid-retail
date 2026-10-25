"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type DiscountValue = {
  discountType: "AMOUNT" | "PERCENT" | null;
  discountValue: string;
};

export function DiscountFields({
  value,
  onChange,
}: {
  value: DiscountValue;
  onChange: (value: DiscountValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="discount-type" className="block text-sm font-medium text-gray-700">
        Product discount <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <div className="flex gap-2">
        <Select
          id="discount-type"
          value={value.discountType ?? ""}
          onChange={(e) =>
            onChange({
              discountType: (e.target.value || null) as DiscountValue["discountType"],
              discountValue: e.target.value ? value.discountValue : "",
            })
          }
          className="w-40"
        >
          <option value="">No discount</option>
          <option value="AMOUNT">Rupees off</option>
          <option value="PERCENT">Percent off</option>
        </Select>
        {value.discountType ? (
          <Input
            aria-label={value.discountType === "PERCENT" ? "Percent off" : "Rupees off"}
            inputMode="numeric"
            value={value.discountValue}
            onChange={(e) => onChange({ ...value, discountValue: e.target.value })}
            placeholder={value.discountType === "PERCENT" ? "e.g. 10" : "e.g. 100"}
            className="w-28"
          />
        ) : null}
      </div>
      <p className="text-xs text-gray-500">Filled in automatically as the line discount at POS.</p>
    </div>
  );
}

export function ImageField({
  currentUrl,
  onChange,
  onRemoveChange,
}: {
  currentUrl?: string | null;
  onChange: (file: File | null) => void;
  onRemoveChange?: (remove: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const shown = preview ?? (removed ? null : (currentUrl ?? null));

  return (
    <div className="space-y-1.5">
      <label htmlFor="image" className="block text-sm font-medium text-gray-700">
        Image <span className="font-normal text-gray-400">(optional, JPG/PNG/WebP up to 2 MB)</span>
      </label>
      <div className="flex items-center gap-3">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploads are served behind login, not via the image optimizer
          <img
            src={shown}
            alt=""
            className="size-14 rounded-lg border border-gray-200 object-cover"
          />
        ) : null}
        <input
          id="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (preview) URL.revokeObjectURL(preview);
            setPreview(file ? URL.createObjectURL(file) : null);
            onChange(file);
          }}
          className="text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-50"
        />
        {currentUrl && !preview && onRemoveChange ? (
          <button
            type="button"
            className="text-sm text-red-600 hover:underline"
            onClick={() => {
              setRemoved(!removed);
              onRemoveChange(!removed);
            }}
          >
            {removed ? "Keep image" : "Remove image"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
