import { z } from "zod";
import { isValidPrefix, isValidSegment, normalizeCode } from "@/lib/codes";
import { UNITS } from "@/lib/units";

// Shared by the forms (for instant feedback) and the server (the real check).

/** "1,500" / " 1500 " / 1500 → 1500. Whole rupees only. */
export const rupees = z.preprocess(
  (value) => (typeof value === "string" ? value.replace(/[,\s]/g, "") || undefined : value),
  z.coerce
    .number({ error: "Enter an amount in rupees" })
    .int("Use whole rupees")
    .min(0, "Cannot be negative")
    .max(100_000_000, "Amount is too large"),
);

export const qtyText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim() || "0");

const optionSchema = z.object({
  value: z.string().trim().min(1, "Option cannot be empty").max(30),
  abbrev: z
    .string()
    .trim()
    .transform(normalizeCode)
    .refine(isValidSegment, "Use 1-8 letters or digits"),
});

export const attributeSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Name is required").max(30),
    type: z.enum(["OPTION", "TEXT"]),
    usedInCode: z.boolean(),
    options: z.array(optionSchema).max(100),
  })
  .superRefine((attribute, ctx) => {
    if (attribute.type === "OPTION" && attribute.options.length === 0) {
      ctx.addIssue({ code: "custom", message: `${attribute.name}: add at least one option` });
    }
    const values = new Set<string>();
    const abbrevs = new Set<string>();
    for (const option of attribute.options) {
      const key = option.value.toLowerCase();
      if (values.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `${attribute.name}: "${option.value}" is listed twice`,
        });
      }
      if (abbrevs.has(option.abbrev)) {
        ctx.addIssue({
          code: "custom",
          message: `${attribute.name}: code "${option.abbrev}" is used by two options`,
        });
      }
      values.add(key);
      abbrevs.add(option.abbrev);
    }
  });

export const categorySchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, "Name is required").max(60),
    codePrefix: z
      .string()
      .trim()
      .transform(normalizeCode)
      .refine(isValidPrefix, "Prefix must be 2-4 letters, e.g. CAP"),
    defaultUnit: z.enum(UNITS),
    isActive: z.boolean(),
    attributes: z.array(attributeSchema).max(10),
  })
  .superRefine((category, ctx) => {
    const names = new Set<string>();
    for (const attribute of category.attributes) {
      const key = attribute.name.toLowerCase();
      if (names.has(key)) {
        ctx.addIssue({ code: "custom", message: `Attribute "${attribute.name}" is listed twice` });
      }
      names.add(key);
    }
  });

export type CategoryInput = z.input<typeof categorySchema>;
export type CategoryData = z.output<typeof categorySchema>;

export const variantInputSchema = z.object({
  values: z.record(z.string(), z.string().trim().max(30)),
  costPrice: rupees,
  salePrice: rupees,
  openingStock: qtyText,
  minStock: qtyText,
});

export type VariantInput = z.input<typeof variantInputSchema>;
export type VariantData = z.output<typeof variantInputSchema>;

export const discountSchema = z
  .object({
    discountType: z.enum(["AMOUNT", "PERCENT"]).nullable(),
    discountValue: z.coerce.number().int().min(0).nullable(),
  })
  .superRefine(({ discountType, discountValue }, ctx) => {
    if (!discountType) return;
    if (!discountValue || discountValue < 1) {
      ctx.addIssue({ code: "custom", message: "Enter the discount amount" });
    } else if (discountType === "PERCENT" && discountValue > 100) {
      ctx.addIssue({ code: "custom", message: "A percent discount cannot be more than 100" });
    }
  });

const productFieldsSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null),
  unit: z.enum(UNITS),
});

export const productCreateSchema = productFieldsSchema.and(discountSchema).and(
  z.object({
    categoryId: z.uuid("Pick a category"),
    variants: z.array(variantInputSchema).min(1, "Add at least one variant").max(200),
  }),
);

export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductCreateData = z.output<typeof productCreateSchema>;

export const productUpdateSchema = productFieldsSchema.and(discountSchema).and(
  z.object({
    isActive: z.boolean(),
  }),
);

export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

export const variantUpdateSchema = z.object({
  id: z.uuid(),
  costPrice: rupees,
  salePrice: rupees,
  minStock: qtyText,
  isActive: z.boolean(),
});

export type VariantUpdateInput = z.input<typeof variantUpdateSchema>;

/** Readable first error from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? "Please check the form";
}
