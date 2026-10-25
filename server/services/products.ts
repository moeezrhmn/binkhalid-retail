import "server-only";
import { Prisma, type Category, type CategoryAttribute } from "@/generated/prisma/client";
import { buildVariantCode, normalizeCode } from "@/lib/codes";
import { db } from "@/lib/db";
import { qtyToMilli } from "@/lib/money";
import type { ProductCreateData, VariantData } from "@/lib/schemas/catalog";
import { allowsFraction, UNIT_LABELS } from "@/lib/units";
import {
  checkVariants,
  cleanValues,
  compareByOptions,
  variantKey,
  variantLabel,
} from "@/lib/variants";
import { counterKey, toAttributeDef } from "./categories";
import { isUniqueViolation, UserError } from "./errors";

type Tx = Prisma.TransactionClient;
type CategoryWithAttributes = Category & { attributes: CategoryAttribute[] };

const CODE_CLASH =
  "A variant code already exists. Check that the options in this category have different codes.";

function rethrowCodeClash(error: unknown): never {
  if (isUniqueViolation(error)) throw new UserError(CODE_CLASH);
  throw error;
}

/** Inserts variants with their codes, and an opening-stock movement for any stock given. */
async function insertVariants(
  tx: Tx,
  product: { id: string; codeSeq: number },
  category: CategoryWithAttributes,
  variants: VariantData[],
) {
  const attributes = category.attributes.map(toAttributeDef);
  const rows = variants.map((variant) => {
    const values = cleanValues(variant.values);
    let code: string;
    try {
      code = buildVariantCode({
        prefix: category.codePrefix,
        productSeq: product.codeSeq,
        attributes,
        values,
      });
    } catch (error) {
      throw new UserError((error as Error).message);
    }
    return {
      productId: product.id,
      code,
      attributes: values,
      costPrice: variant.costPrice,
      salePrice: variant.salePrice,
      stockQty: variant.openingStock,
      minStock: variant.minStock,
    };
  });

  const codes = new Set<string>();
  for (const row of rows) {
    if (codes.has(row.code)) {
      throw new UserError(
        `Two variants would both get code ${row.code}. Give their options different codes.`,
      );
    }
    codes.add(row.code);
  }

  const created = await tx.variant.createManyAndReturn({
    data: rows,
    select: { id: true, code: true, stockQty: true, costPrice: true },
  });

  const openingStock = created.filter((variant) => variant.stockQty.greaterThan(0));
  if (openingStock.length > 0) {
    await tx.stockMovement.createMany({
      data: openingStock.map((variant) => ({
        variantId: variant.id,
        type: "STOCK_IN" as const,
        qty: variant.stockQty,
        unitCost: variant.costPrice,
        reason: "Opening stock",
      })),
    });
  }
  return created;
}

async function loadCategory(tx: Tx, categoryId: string) {
  return tx.category.findUnique({
    where: { id: categoryId },
    include: { attributes: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createProduct(
  data: ProductCreateData,
): Promise<{ id: string; codes: string[] }> {
  try {
    return await db.$transaction(async (tx) => {
      const category = await loadCategory(tx, data.categoryId);
      if (!category || !category.isActive) throw new UserError("Pick an active category");

      const problems = checkVariants(
        data.variants,
        category.attributes.map(toAttributeDef),
        data.unit,
      );
      if (problems.length > 0) throw new UserError(problems.join("\n"));

      const key = counterKey(category.id);
      const counter = await tx.counter.upsert({
        where: { key },
        create: { key, value: 1 },
        update: { value: { increment: 1 } },
      });

      const product = await tx.product.create({
        data: {
          categoryId: category.id,
          name: data.name,
          description: data.description,
          unit: data.unit,
          codeSeq: counter.value,
          discountType: data.discountType,
          discountValue: data.discountType ? data.discountValue : null,
        },
      });

      const variants = await insertVariants(tx, product, category, data.variants);
      return { id: product.id, codes: variants.map((variant) => variant.code) };
    });
  } catch (error) {
    rethrowCodeClash(error);
  }
}

export async function addVariants(productId: string, variants: VariantData[]) {
  try {
    return await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { variants: { select: { attributes: true } } },
      });
      if (!product) throw new UserError("This product no longer exists");
      const category = await loadCategory(tx, product.categoryId);
      if (!category) throw new UserError("This product's category no longer exists");

      const existing = product.variants.map((variant) =>
        variantKey(variant.attributes as Record<string, string>),
      );
      const problems = checkVariants(
        variants,
        category.attributes.map(toAttributeDef),
        product.unit,
        existing,
      );
      if (problems.length > 0) throw new UserError(problems.join("\n"));

      const created = await insertVariants(tx, product, category, variants);
      return { codes: created.map((variant) => variant.code) };
    });
  } catch (error) {
    rethrowCodeClash(error);
  }
}

function hasFraction(value: Prisma.Decimal) {
  return qtyToMilli(value.toString()) % 1000 !== 0;
}

export async function updateProduct(
  productId: string,
  data: {
    name: string;
    description: string | null;
    unit: ProductCreateData["unit"];
    discountType: "AMOUNT" | "PERCENT" | null;
    discountValue: number | null;
    isActive: boolean;
  },
) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { stockQty: true, minStock: true } } },
    });
    if (!product) throw new UserError("This product no longer exists");

    if (data.unit !== product.unit && !allowsFraction(data.unit)) {
      const fractional = product.variants.some(
        (variant) => hasFraction(variant.stockQty) || hasFraction(variant.minStock),
      );
      if (fractional) {
        throw new UserError(
          `Some variants have part quantities (e.g. 2.5), so the unit cannot change to ${UNIT_LABELS[data.unit]}`,
        );
      }
    }

    await tx.product.update({
      where: { id: productId },
      data: {
        name: data.name,
        description: data.description,
        unit: data.unit,
        discountType: data.discountType,
        discountValue: data.discountType ? data.discountValue : null,
        isActive: data.isActive,
      },
    });
  });
}

/** Edits prices, min stock and active state. Stock itself only changes through movements. */
export async function updateVariants(
  productId: string,
  rows: { id: string; costPrice: number; salePrice: number; minStock: string; isActive: boolean }[],
) {
  return db.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { unit: true, variants: { select: { id: true, code: true } } },
    });
    if (!product) throw new UserError("This product no longer exists");

    const codes = new Map(product.variants.map((variant) => [variant.id, variant.code]));
    for (const row of rows) {
      const code = codes.get(row.id);
      if (!code) throw new UserError("A variant does not belong to this product");
      const milli = qtyToMilli(row.minStock);
      if (milli < 0 || (!allowsFraction(product.unit) && milli % 1000 !== 0)) {
        throw new UserError(`${code}: min stock must be a whole number of 0 or more`);
      }
      await tx.variant.update({
        where: { id: row.id },
        data: {
          costPrice: row.costPrice,
          salePrice: row.salePrice,
          minStock: row.minStock,
          isActive: row.isActive,
        },
      });
    }
  });
}

export async function setProductImage(productId: string, imageUrl: string | null) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true },
  });
  if (!product) throw new UserError("This product no longer exists");
  await db.product.update({ where: { id: productId }, data: { imageUrl } });
  return { previous: product.imageUrl };
}

export type ProductListFilter = {
  q?: string;
  categoryId?: string;
  status?: "active" | "inactive" | "all";
  lowStock?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listProducts(filter: ProductListFilter) {
  const pageSize = filter.pageSize ?? 25;
  const page = Math.max(1, filter.page ?? 1);
  const q = filter.q?.trim();

  const where: Prisma.ProductWhereInput = {
    AND: [
      filter.categoryId ? { categoryId: filter.categoryId } : {},
      filter.status === "all" ? {} : { isActive: filter.status !== "inactive" },
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { variants: { some: { code: { contains: normalizeCode(q) } } } },
            ],
          }
        : {},
      filter.lowStock
        ? {
            variants: {
              some: { isActive: true, stockQty: { lte: db.variant.fields.minStock } },
            },
          }
        : {},
    ],
  };

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { name: true } },
        variants: {
          select: { stockQty: true, minStock: true, salePrice: true, isActive: true },
        },
      },
    }),
  ]);

  const items = products.map((product) => {
    const active = product.variants.filter((variant) => variant.isActive);
    const prices = active.map((variant) => variant.salePrice);
    const totalStock = active.reduce(
      (sum, variant) => sum.plus(variant.stockQty),
      new Prisma.Decimal(0),
    );
    return {
      id: product.id,
      name: product.name,
      categoryName: product.category.name,
      unit: product.unit,
      isActive: product.isActive,
      imageUrl: product.imageUrl,
      variantCount: product.variants.length,
      totalStock: totalStock.toString(),
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      outOfStock: active.filter((variant) => variant.stockQty.lessThanOrEqualTo(0)).length,
      lowStock: active.filter(
        (variant) =>
          variant.stockQty.greaterThan(0) && variant.stockQty.lessThanOrEqualTo(variant.minStock),
      ).length,
    };
  });

  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function findVariantByCode(code: string) {
  return db.variant.findUnique({
    where: { code: normalizeCode(code) },
    select: { id: true, productId: true },
  });
}

export async function getProduct(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      category: { include: { attributes: { orderBy: { sortOrder: "asc" } } } },
      variants: { orderBy: [{ createdAt: "asc" }, { code: "asc" }] },
    },
  });
  if (!product) return null;

  const attributes = product.category.attributes;
  const byOptions = compareByOptions(attributes);
  const sorted = [...product.variants].sort((a, b) =>
    byOptions(a.attributes as Record<string, string>, b.attributes as Record<string, string>),
  );
  return {
    ...product,
    variants: sorted.map((variant) => {
      const values = variant.attributes as Record<string, string>;
      return {
        id: variant.id,
        code: variant.code,
        values,
        label: variantLabel(values, attributes),
        costPrice: variant.costPrice,
        salePrice: variant.salePrice,
        stockQty: variant.stockQty.toString(),
        minStock: variant.minStock.toString(),
        isActive: variant.isActive,
        isLow: variant.stockQty.lessThanOrEqualTo(variant.minStock),
      };
    }),
  };
}

/** A filled-in form for "Duplicate product": same category, variants and prices, no stock. */
export async function getProductDraft(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { variants: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!product) return null;
  return {
    categoryId: product.categoryId,
    name: `${product.name} (copy)`,
    description: product.description ?? "",
    unit: product.unit,
    discountType: product.discountType,
    discountValue: product.discountValue,
    variants: product.variants.map((variant) => ({
      values: variant.attributes as Record<string, string>,
      costPrice: variant.costPrice,
      salePrice: variant.salePrice,
      openingStock: "0",
      minStock: variant.minStock.toString(),
    })),
  };
}

export type QuickAddRow = { key: string; name: string } & VariantData;

/** Saves each valid row as its own single-variant product. One bad row never blocks the others. */
export async function quickAddProducts(categoryId: string, rows: QuickAddRow[]) {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category || !category.isActive) throw new UserError("Pick an active category");

  const results: { key: string; ok: boolean; code?: string; error?: string }[] = [];
  for (const row of rows) {
    try {
      const { codes } = await createProduct({
        categoryId,
        name: row.name,
        description: null,
        unit: category.defaultUnit,
        discountType: null,
        discountValue: null,
        variants: [row],
      });
      results.push({ key: row.key, ok: true, code: codes[0] });
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
      results.push({ key: row.key, ok: false, error: error.message });
    }
  }
  return results;
}
