"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateProductAction } from "@/app/(app)/(admin)/products/actions";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UNIT_LABELS, UNITS, type UnitCode } from "@/lib/units";
import { DiscountFields, ImageField } from "./product-fields";

export function ProductDetailsForm({
  product,
}: {
  product: {
    id: string;
    categoryName: string;
    name: string;
    description: string;
    unit: UnitCode;
    discountType: "AMOUNT" | "PERCENT" | null;
    discountValue: number | null;
    isActive: boolean;
    imageUrl: string | null;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [unit, setUnit] = useState(product.unit);
  const [discount, setDiscount] = useState({
    discountType: product.discountType,
    discountValue: product.discountValue ? String(product.discountValue) : "",
  });
  const [isActive, setIsActive] = useState(product.isActive);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    const formData = new FormData();
    formData.set(
      "data",
      JSON.stringify({
        name,
        description,
        unit,
        discountType: discount.discountType,
        discountValue: discount.discountType ? discount.discountValue : null,
        isActive,
      }),
    );
    if (image) formData.set("image", image);
    if (removeImage) formData.set("removeImage", "1");

    startTransition(async () => {
      const result = await updateProductAction(product.id, formData);
      if (!result.ok) return setError(result.error);
      router.push(`/products/${product.id}`);
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
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Edit product</h2>
          <p className="text-sm text-gray-500">
            Category: {product.categoryName}. Codes never change when you edit a product.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Product name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <div className="space-y-1">
            <label htmlFor="unit" className="block text-xs font-medium text-gray-600">
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
        <div className="space-y-1">
          <label htmlFor="description" className="block text-xs font-medium text-gray-600">
            Description <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <Textarea
            id="description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <DiscountFields value={discount} onChange={setDiscount} />
          <ImageField
            currentUrl={product.imageUrl}
            onChange={setImage}
            onRemoveChange={setRemoveImage}
          />
        </div>
        <Checkbox
          label="Active (inactive products cannot be sold)"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Link href={`/products/${product.id}`} className={buttonClasses({ variant: "secondary" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
