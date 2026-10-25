"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  categorySchema,
  firstIssue,
  productCreateSchema,
  productUpdateSchema,
  variantInputSchema,
  variantUpdateSchema,
  type CategoryInput,
  type VariantInput,
  type VariantUpdateInput,
} from "@/lib/schemas/catalog";
import { addCategoryOption, saveCategory } from "@/server/services/categories";
import { toResult, type Result } from "@/server/services/errors";
import { deleteProductImage, saveProductImage } from "@/server/services/images";
import {
  addVariants,
  createProduct,
  quickAddProducts,
  setProductImage,
  updateProduct,
  updateVariants,
} from "@/server/services/products";

const id = z.uuid();

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: firstIssue(error) };
}

export async function saveCategoryAction(input: CategoryInput): Promise<Result<{ id: string }>> {
  await requireAdmin();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await toResult(() => saveCategory(parsed.data));
  revalidatePath("/products", "layout");
  return result;
}

export async function addCategoryOptionAction(input: {
  attributeId: string;
  value: string;
  abbrev: string;
}): Promise<Result<{ value: string; abbrev: string }>> {
  await requireAdmin();
  if (!id.safeParse(input.attributeId).success) return { ok: false, error: "Unknown attribute" };
  const result = await toResult(() => addCategoryOption(input));
  revalidatePath("/products", "layout");
  return result;
}

/** FormData: "data" (JSON of the product) and an optional "image" file. */
export async function createProductAction(
  formData: FormData,
): Promise<Result<{ id: string; codes: string[] }>> {
  await requireAdmin();
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    return { ok: false, error: "The form could not be read. Please try again." };
  }
  const parsed = productCreateSchema.safeParse(json);
  if (!parsed.success) return invalid(parsed.error);

  return toResult(async () => {
    const image = formData.get("image");
    const imageUrl = image instanceof File && image.size > 0 ? await saveProductImage(image) : null;
    try {
      const created = await createProduct(parsed.data);
      if (imageUrl) await setProductImage(created.id, imageUrl);
      revalidatePath("/products", "layout");
      return created;
    } catch (error) {
      await deleteProductImage(imageUrl);
      throw error;
    }
  });
}

/** FormData: "data" (JSON), optional "image" file, optional "removeImage" = "1". */
export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<Result<null>> {
  await requireAdmin();
  if (!id.safeParse(productId).success) return { ok: false, error: "Unknown product" };
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("data") ?? ""));
  } catch {
    return { ok: false, error: "The form could not be read. Please try again." };
  }
  const parsed = productUpdateSchema.safeParse(json);
  if (!parsed.success) return invalid(parsed.error);

  return toResult(async () => {
    await updateProduct(productId, parsed.data);

    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      const url = await saveProductImage(image);
      const { previous } = await setProductImage(productId, url);
      await deleteProductImage(previous);
    } else if (formData.get("removeImage") === "1") {
      const { previous } = await setProductImage(productId, null);
      await deleteProductImage(previous);
    }
    revalidatePath("/products", "layout");
    return null;
  });
}

export async function addVariantsAction(
  productId: string,
  variants: VariantInput[],
): Promise<Result<{ codes: string[] }>> {
  await requireAdmin();
  if (!id.safeParse(productId).success) return { ok: false, error: "Unknown product" };
  const parsed = z
    .array(variantInputSchema)
    .min(1, "Pick at least one new variant")
    .max(200)
    .safeParse(variants);
  if (!parsed.success) return invalid(parsed.error);
  const result = await toResult(() => addVariants(productId, parsed.data));
  revalidatePath("/products", "layout");
  return result;
}

export async function updateVariantsAction(
  productId: string,
  rows: VariantUpdateInput[],
): Promise<Result<null>> {
  await requireAdmin();
  if (!id.safeParse(productId).success) return { ok: false, error: "Unknown product" };
  const parsed = z.array(variantUpdateSchema).max(500).safeParse(rows);
  if (!parsed.success) return invalid(parsed.error);
  const result = await toResult(async () => {
    await updateVariants(productId, parsed.data);
    return null;
  });
  revalidatePath("/products", "layout");
  return result;
}

const quickAddRowSchema = variantInputSchema.extend({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Name is required").max(100),
});

export type QuickAddRowInput = z.input<typeof quickAddRowSchema>;
export type QuickAddResult = { key: string; ok: boolean; code?: string; error?: string };

export async function quickAddAction(
  categoryId: string,
  rows: QuickAddRowInput[],
): Promise<Result<QuickAddResult[]>> {
  await requireAdmin();
  if (!id.safeParse(categoryId).success) return { ok: false, error: "Pick a category" };
  if (rows.length === 0) return { ok: false, error: "Add at least one row" };
  if (rows.length > 200) return { ok: false, error: "Save at most 200 rows at a time" };

  // Rows that fail basic checks are reported per row; the rest are saved.
  const invalidRows: QuickAddResult[] = [];
  const validRows: z.output<typeof quickAddRowSchema>[] = [];
  for (const row of rows) {
    const parsed = quickAddRowSchema.safeParse(row);
    if (parsed.success) validRows.push(parsed.data);
    else invalidRows.push({ key: String(row.key), ok: false, error: firstIssue(parsed.error) });
  }

  const result = await toResult(() => quickAddProducts(categoryId, validRows));
  revalidatePath("/products", "layout");
  if (!result.ok) return result;
  return { ok: true, data: [...result.data, ...invalidRows] };
}
