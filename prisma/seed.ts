import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient, type Unit } from "../generated/prisma/client";
import { buildVariantCode, type CodeAttribute } from "../lib/codes";

// Same connection settings as the app (UTC session, schema from "?schema=").
const connectionString = process.env.DATABASE_URL;
const schema = connectionString ? new URL(connectionString).searchParams.get("schema") : null;
const db = new PrismaClient({
  adapter: new PrismaPg(
    {
      connectionString,
      options: ["-c TimeZone=UTC", ...(schema ? [`-c search_path="${schema}"`] : [])].join(" "),
    },
    schema ? { schema } : undefined,
  ),
});

type AttributeSeed = { name: string; options: Record<string, string> };
type CategorySeed = { name: string; prefix: string; unit: Unit; attributes: AttributeSeed[] };

// options: value -> code abbreviation
const CATEGORIES: CategorySeed[] = [
  {
    name: "Caps",
    prefix: "CAP",
    unit: "PIECE",
    attributes: [
      { name: "Color", options: { Black: "BLK", White: "WHT", Grey: "GRY", Maroon: "MRN" } },
      { name: "Size", options: { S: "S", M: "M", L: "L", XL: "XL" } },
    ],
  },
  {
    name: "Perfumes and Ittar",
    prefix: "ATR",
    unit: "BOTTLE",
    attributes: [
      {
        name: "Volume",
        options: {
          "3 ml": "3ML",
          "6 ml": "6ML",
          "12 ml": "12ML",
          "50 ml": "50ML",
          "100 ml": "100ML",
        },
      },
    ],
  },
  {
    name: "Waistcoats",
    prefix: "WST",
    unit: "PIECE",
    attributes: [
      { name: "Color", options: { Black: "BLK", Navy: "NVY", Brown: "BRN", Grey: "GRY" } },
      { name: "Size", options: { "36": "36", "38": "38", "40": "40", "42": "42", "44": "44" } },
    ],
  },
  {
    name: "Unstitched Suits",
    prefix: "SUT",
    unit: "PIECE",
    attributes: [
      {
        name: "Color",
        options: { White: "WHT", "Off White": "OWT", Black: "BLK", Grey: "GRY", Brown: "BRN" },
      },
    ],
  },
  {
    name: "Honey",
    prefix: "HNY",
    unit: "BOTTLE",
    attributes: [{ name: "Weight", options: { "250 g": "250G", "500 g": "500G", "1 kg": "1KG" } }],
  },
];

type VariantSeed = { values: Record<string, string>; cost: number; price: number; stock: number };
type ProductSeed = { category: string; name: string; minStock: number; variants: VariantSeed[] };

function grid(
  a: [string, string[]],
  b: [string, string[]],
  rest: Omit<VariantSeed, "values">,
): VariantSeed[] {
  return a[1].flatMap((x) => b[1].map((y) => ({ values: { [a[0]]: x, [b[0]]: y }, ...rest })));
}

const SAMPLE_PRODUCTS: ProductSeed[] = [
  {
    category: "Caps",
    name: "Velvet Prayer Cap",
    minStock: 3,
    variants: grid(["Color", ["Black", "White"]], ["Size", ["M", "L"]], {
      cost: 350,
      price: 650,
      stock: 10,
    }),
  },
  {
    category: "Perfumes and Ittar",
    name: "Rose Ittar",
    minStock: 5,
    variants: [
      { values: { Volume: "3 ml" }, cost: 300, price: 500, stock: 20 },
      { values: { Volume: "6 ml" }, cost: 550, price: 900, stock: 20 },
      { values: { Volume: "12 ml" }, cost: 1000, price: 1600, stock: 10 },
    ],
  },
  {
    category: "Waistcoats",
    name: "Classic Waistcoat",
    minStock: 1,
    variants: grid(["Color", ["Black", "Navy"]], ["Size", ["38", "40", "42"]], {
      cost: 2500,
      price: 4500,
      stock: 3,
    }),
  },
  {
    category: "Unstitched Suits",
    name: "Wash and Wear Suit",
    minStock: 2,
    variants: [
      { values: { Color: "White" }, cost: 2200, price: 3500, stock: 8 },
      { values: { Color: "Grey" }, cost: 2200, price: 3500, stock: 8 },
    ],
  },
  {
    category: "Honey",
    name: "Sidr Honey",
    minStock: 4,
    variants: [
      { values: { Weight: "500 g" }, cost: 1400, price: 2200, stock: 12 },
      { values: { Weight: "1 kg" }, cost: 2600, price: 4000, stock: 12 },
    ],
  },
];

const DEFAULT_SETTINGS: Record<string, string> = {
  shopName: "Bin Khalid",
  shopAddress: "",
  shopPhone: "",
  receiptHeader: "",
  receiptFooter: "Thank you for shopping with us!",
  labelWidthMm: "50",
  labelHeightMm: "30",
  receiptWidthMm: "80",
};

async function seedAdmin() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin "${username}" already exists, password left unchanged.`);
    return;
  }
  const admins = await db.user.count({ where: { type: "ADMIN" } });
  if (admins > 0) {
    console.log("An admin account already exists, not creating another.");
    return;
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error("Set ADMIN_PASSWORD (at least 8 characters) in .env before seeding.");
  }
  await db.user.create({
    data: {
      name: process.env.ADMIN_NAME?.trim() || "Admin",
      type: "ADMIN",
      username,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Created admin "${username}".`);
}

async function seedSettingsAndCounters() {
  await db.setting.createMany({
    data: Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })),
    skipDuplicates: true,
  });
  await db.counter.createMany({
    data: [{ key: "bill" }, { key: "return" }],
    skipDuplicates: true,
  });
}

async function seedCategories() {
  for (const [index, seed] of CATEGORIES.entries()) {
    const category = await db.category.upsert({
      where: { name: seed.name },
      update: {},
      create: {
        name: seed.name,
        codePrefix: seed.prefix,
        defaultUnit: seed.unit,
        sortOrder: index,
      },
    });
    await db.counter.createMany({
      data: [{ key: `product:${category.id}` }],
      skipDuplicates: true,
    });
    for (const [attrIndex, attribute] of seed.attributes.entries()) {
      await db.categoryAttribute.upsert({
        where: { categoryId_name: { categoryId: category.id, name: attribute.name } },
        update: {},
        create: {
          categoryId: category.id,
          name: attribute.name,
          type: "OPTION",
          options: Object.keys(attribute.options),
          codeAbbrevs: attribute.options,
          usedInCode: true,
          sortOrder: attrIndex,
        },
      });
    }
  }
  console.log(`Categories ready: ${CATEGORIES.map((c) => c.name).join(", ")}.`);
}

async function seedSampleProducts() {
  // Opt-in (npm run db:seed:sample), so the shop's server never gets sample products.
  if (process.env.SEED_SAMPLE_DATA !== "true" || process.env.NODE_ENV === "production") return;
  if ((await db.product.count()) > 0) {
    console.log("Products already exist, skipping sample products.");
    return;
  }

  for (const seed of SAMPLE_PRODUCTS) {
    await db.$transaction(async (tx) => {
      const category = await tx.category.findUniqueOrThrow({
        where: { name: seed.category },
        include: { attributes: true },
      });
      const counter = await tx.counter.update({
        where: { key: `product:${category.id}` },
        data: { value: { increment: 1 } },
      });
      const product = await tx.product.create({
        data: {
          categoryId: category.id,
          name: seed.name,
          unit: category.defaultUnit,
          codeSeq: counter.value,
        },
      });

      const attributes: CodeAttribute[] = category.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        usedInCode: a.usedInCode,
        sortOrder: a.sortOrder,
        codeAbbrevs: a.codeAbbrevs as Record<string, string>,
      }));

      for (const variant of seed.variants) {
        const stock = new Prisma.Decimal(variant.stock);
        const created = await tx.variant.create({
          data: {
            productId: product.id,
            code: buildVariantCode({
              prefix: category.codePrefix,
              productSeq: product.codeSeq,
              attributes,
              values: variant.values,
            }),
            attributes: variant.values,
            costPrice: variant.cost,
            salePrice: variant.price,
            stockQty: stock,
            minStock: new Prisma.Decimal(seed.minStock),
          },
        });
        await tx.stockMovement.create({
          data: {
            variantId: created.id,
            type: "STOCK_IN",
            qty: stock,
            unitCost: variant.cost,
            reason: "Opening stock",
          },
        });
      }
    });
  }
  console.log(`Created ${SAMPLE_PRODUCTS.length} sample products.`);
}

async function main() {
  await seedAdmin();
  await seedSettingsAndCounters();
  await seedCategories();
  await seedSampleProducts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
