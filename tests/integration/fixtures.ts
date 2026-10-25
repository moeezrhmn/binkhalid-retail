import { db } from "@/lib/db";
import { categorySchema, productCreateSchema } from "@/lib/schemas/catalog";
import { saveCategory } from "@/server/services/categories";
import { createProduct } from "@/server/services/products";

/** A category, one product with variants, a user and a customer, ready for selling. */
export async function shopFixture() {
  const caps = await saveCategory(
    categorySchema.parse({
      name: "Caps",
      codePrefix: "CAP",
      defaultUnit: "PIECE",
      isActive: true,
      attributes: [
        {
          name: "Color",
          type: "OPTION",
          usedInCode: true,
          options: [
            { value: "Black", abbrev: "BLK" },
            { value: "White", abbrev: "WHT" },
          ],
        },
      ],
    }),
  );
  const suits = await saveCategory(
    categorySchema.parse({
      name: "Suits",
      codePrefix: "SUT",
      defaultUnit: "METER",
      isActive: true,
      attributes: [],
    }),
  );

  const cap = await createProduct(
    productCreateSchema.parse({
      categoryId: caps.id,
      name: "Velvet Cap",
      description: "",
      unit: "PIECE",
      discountType: null,
      discountValue: null,
      variants: [
        {
          values: { Color: "Black" },
          costPrice: 300,
          salePrice: 650,
          openingStock: "10",
          minStock: "2",
        },
        {
          values: { Color: "White" },
          costPrice: 300,
          salePrice: 650,
          openingStock: "1",
          minStock: "2",
        },
      ],
    }),
  );
  const suit = await createProduct(
    productCreateSchema.parse({
      categoryId: suits.id,
      name: "Wash and Wear",
      description: "",
      unit: "METER",
      discountType: null,
      discountValue: null,
      variants: [{ values: {}, costPrice: 200, salePrice: 333, openingStock: "20", minStock: "0" }],
    }),
  );

  const variants = await db.variant.findMany({ orderBy: { code: "asc" } });
  const byCode = (code: string) => variants.find((v) => v.code === code)!;

  const user = await db.user.create({
    data: { name: "Cashier", type: "STAFF", username: "cashier", passwordHash: "x" },
  });
  const customer = await db.customer.create({ data: { name: "Ali Raza", phone: "03001234567" } });

  return {
    black: byCode("CAP-0001-BLK"),
    white: byCode("CAP-0001-WHT"),
    suit: byCode("SUT-0001"),
    productIds: [cap.id, suit.id],
    user,
    customer,
  };
}

export async function stockOf(variantId: string) {
  const variant = await db.variant.findUniqueOrThrow({ where: { id: variantId } });
  return variant.stockQty.toString();
}

export async function flowsFor(where: { saleId?: string; saleReturnId?: string }) {
  const rows = await db.cashFlow.findMany({ where, orderBy: { amount: "desc" } });
  return rows.map((row) => [row.type, row.method, row.amount] as const);
}
