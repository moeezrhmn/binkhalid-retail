import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { categorySchema, productCreateSchema, type CategoryInput } from "@/lib/schemas/catalog";
import { addCategoryOption, counterKey, saveCategory } from "@/server/services/categories";
import { UserError } from "@/server/services/errors";
import {
  addVariants,
  createProduct,
  findVariantByCode,
  listProducts,
  quickAddProducts,
  updateProduct,
} from "@/server/services/products";

const capsInput: CategoryInput = {
  name: "Caps",
  codePrefix: "cap",
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
        { value: "Grey", abbrev: "GRY" },
      ],
    },
    {
      name: "Size",
      type: "OPTION",
      usedInCode: true,
      options: ["S", "M", "L", "XL"].map((value) => ({ value, abbrev: value })),
    },
  ],
};

async function createCaps() {
  return saveCategory(categorySchema.parse(capsInput));
}

function variant(values: Record<string, string>, stock = "0") {
  return { values, costPrice: 350, salePrice: 650, openingStock: stock, minStock: "2" };
}

function productInput(
  categoryId: string,
  variants: ReturnType<typeof variant>[],
  name = "Velvet Prayer Cap",
) {
  return productCreateSchema.parse({
    categoryId,
    name,
    description: "",
    unit: "PIECE",
    discountType: null,
    discountValue: null,
    variants,
  });
}

function grid() {
  return ["Black", "White", "Grey"].flatMap((Color) =>
    ["S", "M", "L", "XL"].map((Size) => variant({ Color, Size }, "5")),
  );
}

describe("categories", () => {
  it("creates a category with its attributes and a product counter", async () => {
    const { id } = await createCaps();
    const category = await db.category.findUniqueOrThrow({
      where: { id },
      include: { attributes: { orderBy: { sortOrder: "asc" } } },
    });
    expect(category.codePrefix).toBe("CAP");
    expect(category.attributes.map((a) => a.name)).toEqual(["Color", "Size"]);
    expect(category.attributes[0].codeAbbrevs).toEqual({ Black: "BLK", White: "WHT", Grey: "GRY" });
    expect(await db.counter.findUnique({ where: { key: counterKey(id) } })).toMatchObject({
      value: 0,
    });
  });

  it("rejects a duplicate prefix or name", async () => {
    await createCaps();
    await expect(
      saveCategory(categorySchema.parse({ ...capsInput, name: "Hats" })),
    ).rejects.toThrow(/Prefix CAP is already used/);
    await expect(
      saveCategory(categorySchema.parse({ ...capsInput, codePrefix: "HAT", name: "caps" })),
    ).rejects.toThrow(/already exists/);
  });

  it("locks the code structure once products exist, but allows new options", async () => {
    const { id } = await createCaps();
    await createProduct(productInput(id, [variant({ Color: "Black", Size: "M" })]));
    const attributes = await db.categoryAttribute.findMany({
      where: { categoryId: id },
      orderBy: { sortOrder: "asc" },
    });
    const withIds = {
      ...capsInput,
      id,
      attributes: capsInput.attributes.map((attribute, index) => ({
        ...attribute,
        id: attributes[index].id,
      })),
    };

    await expect(
      saveCategory(categorySchema.parse({ ...withIds, codePrefix: "CP" })),
    ).rejects.toThrow(/prefix cannot change/);
    await expect(
      saveCategory(
        categorySchema.parse({ ...withIds, attributes: withIds.attributes.slice(0, 1) }),
      ),
    ).rejects.toThrow(/cannot be added, removed, renamed or reordered/);

    // "Black" is used by the variant, "Grey" is not
    const removeBlack = structuredClone(withIds);
    removeBlack.attributes[0].options = removeBlack.attributes[0].options.filter(
      (o) => o.value !== "Black",
    );
    await expect(saveCategory(categorySchema.parse(removeBlack))).rejects.toThrow(
      /Black" is used by 1 variant/,
    );

    const removeGrey = structuredClone(withIds);
    removeGrey.attributes[0].options = removeGrey.attributes[0].options.filter(
      (o) => o.value !== "Grey",
    );
    removeGrey.attributes[0].options.push({ value: "Maroon", abbrev: "MRN" });
    await saveCategory(categorySchema.parse(removeGrey));
    const color = await db.categoryAttribute.findUniqueOrThrow({ where: { id: attributes[0].id } });
    expect(color.options).toEqual(["Black", "White", "Maroon"]);
  });

  it("adds a single option and refuses duplicates", async () => {
    const { id } = await createCaps();
    const color = await db.categoryAttribute.findFirstOrThrow({
      where: { categoryId: id, name: "Color" },
    });
    await addCategoryOption({ attributeId: color.id, value: "Navy", abbrev: "nvy" });
    await expect(
      addCategoryOption({ attributeId: color.id, value: "navy", abbrev: "NV" }),
    ).rejects.toThrow(/already an option/);
    await expect(
      addCategoryOption({ attributeId: color.id, value: "Night", abbrev: "NVY" }),
    ).rejects.toThrow(/already used/);
  });
});

describe("products", () => {
  it("creates 12 variants with unique codes and opening stock movements", async () => {
    const { id } = await createCaps();
    const { id: productId, codes } = await createProduct(productInput(id, grid()));

    expect(codes).toHaveLength(12);
    expect(new Set(codes).size).toBe(12);
    expect(codes).toContain("CAP-0001-BLK-M");
    expect(codes).toContain("CAP-0001-GRY-XL");

    const variants = await db.variant.findMany({
      where: { productId },
      include: { movements: true },
    });
    for (const v of variants) {
      expect(v.stockQty.toString()).toBe("5");
      expect(v.movements).toHaveLength(1);
      expect(v.movements[0]).toMatchObject({
        type: "STOCK_IN",
        reason: "Opening stock",
        unitCost: 350,
      });
      expect(v.movements[0].qty.toString()).toBe("5");
    }
  });

  it("numbers products per category: 0001, 0002", async () => {
    const { id } = await createCaps();
    await createProduct(productInput(id, [variant({ Color: "Black", Size: "M" })]));
    const second = await createProduct(
      productInput(id, [variant({ Color: "Black", Size: "M" })], "Cotton Cap"),
    );
    expect(second.codes).toEqual(["CAP-0002-BLK-M"]);
  });

  it("skips the movement when opening stock is 0", async () => {
    const { id } = await createCaps();
    const { id: productId } = await createProduct(
      productInput(id, [variant({ Color: "White", Size: "L" })]),
    );
    expect(await db.stockMovement.count({ where: { variant: { productId } } })).toBe(0);
  });

  it("supports a single-variant product without attributes", async () => {
    const { id } = await createCaps();
    const { codes } = await createProduct(productInput(id, [variant({})]));
    expect(codes).toEqual(["CAP-0001"]);
  });

  it("rejects duplicates, unknown options and part pieces, without using a number", async () => {
    const { id } = await createCaps();
    await expect(
      createProduct(productInput(id, [variant({ Color: "Black" }), variant({ Color: "Black" })])),
    ).rejects.toThrow(/already exists/);
    await expect(createProduct(productInput(id, [variant({ Color: "Pink" })]))).rejects.toThrow(
      /not an option/,
    );
    await expect(
      createProduct(productInput(id, [variant({ Color: "Black" }, "1.5")])),
    ).rejects.toThrow(/whole numbers/);
    expect(await db.product.count()).toBe(0);
    expect(await db.counter.findUnique({ where: { key: counterKey(id) } })).toMatchObject({
      value: 0,
    });
  });

  it("adds variants to an existing product with its own number", async () => {
    const { id } = await createCaps();
    const { id: productId } = await createProduct(
      productInput(id, [variant({ Color: "Black", Size: "M" })]),
    );
    await createProduct(productInput(id, [variant({ Color: "Black", Size: "M" })], "Other"));

    const { codes } = await addVariants(productId, [variant({ Color: "Black", Size: "XL" }, "3")]);
    expect(codes).toEqual(["CAP-0001-BLK-XL"]);
    await expect(addVariants(productId, [variant({ Color: "Black", Size: "M" })])).rejects.toThrow(
      /already exists/,
    );
  });

  it("blocks changing to a whole-number unit when stock has parts", async () => {
    const category = await saveCategory(
      categorySchema.parse({
        name: "Suits",
        codePrefix: "SUT",
        defaultUnit: "METER",
        isActive: true,
        attributes: [],
      }),
    );
    const { id: productId } = await createProduct(
      productCreateSchema.parse({
        categoryId: category.id,
        name: "Cotton",
        description: "",
        unit: "METER",
        discountType: null,
        discountValue: null,
        variants: [variant({}, "2.5")],
      }),
    );
    const base = {
      name: "Cotton",
      description: null,
      discountType: null,
      discountValue: null,
      isActive: true,
    };
    await expect(updateProduct(productId, { ...base, unit: "PIECE" })).rejects.toBeInstanceOf(
      UserError,
    );
    await updateProduct(productId, { ...base, unit: "GRAM" });
  });

  it("quick add saves valid rows and reports bad ones", async () => {
    const { id } = await createCaps();
    const results = await quickAddProducts(id, [
      {
        key: "a",
        name: "Plain Cap",
        ...productInput(id, [variant({ Color: "Black" }, "4")]).variants[0],
      },
      { key: "b", name: "Bad Cap", ...productInput(id, [variant({ Color: "Pink" })]).variants[0] },
      {
        key: "c",
        name: "Knit Cap",
        ...productInput(id, [variant({ Color: "White" })]).variants[0],
      },
    ]);
    expect(results.map((r) => [r.key, r.ok, r.code ?? r.error])).toEqual([
      ["a", true, "CAP-0001-BLK"],
      ["b", false, '"Pink" is not an option of Color'],
      ["c", true, "CAP-0002-WHT"],
    ]);
  });

  it("finds products by name or code and filters low stock", async () => {
    const { id } = await createCaps();
    await createProduct(productInput(id, [variant({ Color: "Black", Size: "M" }, "10")]));
    await createProduct(
      productInput(id, [variant({ Color: "White", Size: "M" }, "1")], "Cotton Cap"),
    );

    expect((await listProducts({ q: "velvet" })).items.map((p) => p.name)).toEqual([
      "Velvet Prayer Cap",
    ]);
    expect((await listProducts({ q: "cap-0002" })).items.map((p) => p.name)).toEqual([
      "Cotton Cap",
    ]);
    expect((await listProducts({ lowStock: true })).items.map((p) => p.name)).toEqual([
      "Cotton Cap",
    ]);
    expect(await findVariantByCode(" cap-0001-blk-m ")).not.toBeNull();
    expect(await findVariantByCode("CAP-9999")).toBeNull();
  });
});
