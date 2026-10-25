import "server-only";
import type { CategoryAttribute } from "@/generated/prisma/client";
import { isValidSegment, normalizeCode } from "@/lib/codes";
import { db } from "@/lib/db";
import type { CategoryData } from "@/lib/schemas/catalog";
import type { AttributeDef } from "@/lib/variants";
import { UserError } from "./errors";

export type AttributeForm = {
  id?: string;
  name: string;
  type: "OPTION" | "TEXT";
  usedInCode: boolean;
  options: { value: string; abbrev: string }[];
};

export function counterKey(categoryId: string) {
  return `product:${categoryId}`;
}

export function toAttributeDef(attribute: CategoryAttribute): AttributeDef {
  return {
    name: attribute.name,
    type: attribute.type,
    usedInCode: attribute.usedInCode,
    sortOrder: attribute.sortOrder,
    options: attribute.options,
    codeAbbrevs: (attribute.codeAbbrevs ?? {}) as Record<string, string>,
  };
}

export function toAttributeForm(attribute: CategoryAttribute): AttributeForm {
  const abbrevs = (attribute.codeAbbrevs ?? {}) as Record<string, string>;
  return {
    id: attribute.id,
    name: attribute.name,
    type: attribute.type,
    usedInCode: attribute.usedInCode,
    options: attribute.options.map((value) => ({ value, abbrev: abbrevs[value] ?? "" })),
  };
}

export async function listCategories({ activeOnly = false } = {}) {
  return db.category.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      attributes: { orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true } },
    },
  });
}

export async function getCategory(id: string) {
  return db.category.findUnique({
    where: { id },
    include: {
      attributes: { orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true } },
    },
  });
}

function attributeData(attribute: CategoryData["attributes"][number], sortOrder: number) {
  const options = attribute.type === "OPTION" ? attribute.options : [];
  return {
    name: attribute.name,
    type: attribute.type,
    usedInCode: attribute.usedInCode,
    sortOrder,
    options: options.map((option) => option.value),
    codeAbbrevs: Object.fromEntries(options.map((option) => [option.value, option.abbrev])),
  };
}

/**
 * Creates or updates a category with its attributes.
 * Once a category has products, its code structure is locked: the prefix and the
 * attributes (names, types, code use, order) cannot change, because they decide
 * how codes are built. Options can still be added, and abbreviations edited.
 */
export async function saveCategory(data: CategoryData): Promise<{ id: string }> {
  return db.$transaction(async (tx) => {
    const clash = await tx.category.findFirst({
      where: {
        id: data.id ? { not: data.id } : undefined,
        OR: [{ name: { equals: data.name, mode: "insensitive" } }, { codePrefix: data.codePrefix }],
      },
      select: { name: true, codePrefix: true },
    });
    if (clash) {
      throw new UserError(
        clash.codePrefix === data.codePrefix
          ? `Prefix ${data.codePrefix} is already used by ${clash.name}`
          : `A category named "${clash.name}" already exists`,
      );
    }

    const fields = {
      name: data.name,
      codePrefix: data.codePrefix,
      defaultUnit: data.defaultUnit,
      isActive: data.isActive,
    };

    if (!data.id) {
      const last = await tx.category.aggregate({ _max: { sortOrder: true } });
      const category = await tx.category.create({
        data: {
          ...fields,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
          attributes: { create: data.attributes.map(attributeData) },
        },
      });
      await tx.counter.create({ data: { key: counterKey(category.id) } });
      return { id: category.id };
    }

    const existing = await tx.category.findUnique({
      where: { id: data.id },
      include: {
        attributes: { orderBy: { sortOrder: "asc" } },
        _count: { select: { products: true } },
      },
    });
    if (!existing) throw new UserError("This category no longer exists");

    const locked = existing._count.products > 0;
    if (locked) {
      if (existing.codePrefix !== data.codePrefix) {
        throw new UserError("The prefix cannot change once the category has products");
      }
      const sameStructure =
        existing.attributes.length === data.attributes.length &&
        existing.attributes.every((old, index) => {
          const next = data.attributes[index];
          return (
            next.id === old.id &&
            next.name === old.name &&
            next.type === old.type &&
            next.usedInCode === old.usedInCode
          );
        });
      if (!sameStructure) {
        throw new UserError(
          "Attributes cannot be added, removed, renamed or reordered once the category has products. You can still add options and edit their codes.",
        );
      }
      for (const [index, old] of existing.attributes.entries()) {
        const kept = new Set(data.attributes[index].options.map((option) => option.value));
        for (const value of old.options.filter((option) => !kept.has(option))) {
          const used = await tx.variant.count({
            where: {
              product: { categoryId: existing.id },
              attributes: { path: [old.name], equals: value },
            },
          });
          if (used > 0) {
            throw new UserError(
              `${old.name} "${value}" is used by ${used} variant(s) and cannot be removed`,
            );
          }
        }
      }
    }

    await tx.category.update({ where: { id: existing.id }, data: fields });

    const keepIds = new Set(
      data.attributes.flatMap((attribute) => (attribute.id ? [attribute.id] : [])),
    );
    await tx.categoryAttribute.deleteMany({
      where: { categoryId: existing.id, id: { notIn: [...keepIds] } },
    });
    for (const [index, attribute] of data.attributes.entries()) {
      const values = attributeData(attribute, index);
      if (attribute.id && existing.attributes.some((old) => old.id === attribute.id)) {
        await tx.categoryAttribute.update({ where: { id: attribute.id }, data: values });
      } else {
        await tx.categoryAttribute.create({ data: { ...values, categoryId: existing.id } });
      }
    }
    return { id: existing.id };
  });
}

/** Adds one option to an attribute, e.g. a new color typed in the product form. */
export async function addCategoryOption(input: {
  attributeId: string;
  value: string;
  abbrev: string;
}): Promise<{ value: string; abbrev: string }> {
  const value = input.value.trim();
  const abbrev = normalizeCode(input.abbrev);
  if (!value || value.length > 30) throw new UserError("Enter an option of up to 30 characters");
  if (!isValidSegment(abbrev)) throw new UserError("The code must be 1-8 letters or digits");

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CategoryAttribute" WHERE id = ${input.attributeId}::uuid FOR UPDATE`;
    const attribute = await tx.categoryAttribute.findUnique({ where: { id: input.attributeId } });
    if (!attribute || attribute.type !== "OPTION")
      throw new UserError("This attribute does not take options");

    const abbrevs = (attribute.codeAbbrevs ?? {}) as Record<string, string>;
    if (attribute.options.some((option) => option.toLowerCase() === value.toLowerCase())) {
      throw new UserError(`"${value}" is already an option of ${attribute.name}`);
    }
    if (Object.values(abbrevs).includes(abbrev)) {
      throw new UserError(`Code ${abbrev} is already used by another ${attribute.name}`);
    }

    await tx.categoryAttribute.update({
      where: { id: attribute.id },
      data: {
        options: [...attribute.options, value],
        codeAbbrevs: { ...abbrevs, [value]: abbrev },
      },
    });
    return { value, abbrev };
  });
}
