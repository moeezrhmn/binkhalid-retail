import "server-only";
import { normalizeCode } from "@/lib/codes";
import { todayRange } from "@/lib/dates";
import { db } from "@/lib/db";
import { qtyToMilli } from "@/lib/money";
import { allowsFraction } from "@/lib/units";
import { variantLabel } from "@/lib/variants";

export type LabelVariant = {
  id: string;
  code: string;
  productName: string;
  variantText: string;
  salePrice: number;
  costPrice: number;
  unit: "PIECE" | "BOTTLE" | "METER" | "ML" | "GRAM";
  stockQty: string;
  /** Suggested number of labels: one per unit in stock for countable items, otherwise 1. */
  suggestedCopies: number;
};

const MAX_RESULTS = 30;
const MAX_SUGGESTED = 500;

const include = {
  product: {
    select: {
      name: true,
      unit: true,
      category: { select: { attributes: { select: { name: true, sortOrder: true } } } },
    },
  },
} as const;

type VariantRow = Awaited<ReturnType<typeof findVariants>>[number];

function findVariants(
  where: NonNullable<Parameters<typeof db.variant.findMany>[0]>["where"],
  take?: number,
) {
  return db.variant.findMany({
    where: { isActive: true, product: { isActive: true }, ...where },
    include,
    orderBy: [{ product: { name: "asc" } }, { code: "asc" }],
    take,
  });
}

function toLabelVariant(variant: VariantRow): LabelVariant {
  const whole = !allowsFraction(variant.product.unit);
  const stock = Math.floor(qtyToMilli(variant.stockQty.toString()) / 1000);
  return {
    id: variant.id,
    code: variant.code,
    productName: variant.product.name,
    variantText: variantLabel(
      variant.attributes as Record<string, string>,
      variant.product.category.attributes,
    ),
    salePrice: variant.salePrice,
    costPrice: variant.costPrice,
    unit: variant.product.unit,
    stockQty: variant.stockQty.toString(),
    suggestedCopies: whole ? Math.min(Math.max(stock, 1), MAX_SUGGESTED) : 1,
  };
}

export async function searchLabelVariants(q: string): Promise<LabelVariant[]> {
  const term = q.trim();
  if (!term) return [];
  const rows = await findVariants(
    {
      OR: [
        { code: { contains: normalizeCode(term) } },
        { product: { name: { contains: term, mode: "insensitive" } } },
      ],
    },
    MAX_RESULTS,
  );
  return rows.map(toLabelVariant);
}

export async function labelVariantsAddedToday(): Promise<LabelVariant[]> {
  const { from, to } = todayRange();
  return (await findVariants({ createdAt: { gte: from, lt: to } })).map(toLabelVariant);
}

export async function labelVariantsByIds(ids: string[]): Promise<LabelVariant[]> {
  if (ids.length === 0) return [];
  const rows = await findVariants({ id: { in: ids } });
  const byId = new Map(rows.map((row) => [row.id, toLabelVariant(row)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}
