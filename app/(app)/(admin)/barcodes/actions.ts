"use server";

import { requireAdmin } from "@/lib/auth";
import {
  labelVariantsAddedToday,
  searchLabelVariants,
  type LabelVariant,
} from "@/server/services/labels";

export async function searchLabelVariantsAction(q: string): Promise<LabelVariant[]> {
  await requireAdmin();
  return searchLabelVariants(String(q).slice(0, 100));
}

export async function labelVariantsAddedTodayAction(): Promise<LabelVariant[]> {
  await requireAdmin();
  return labelVariantsAddedToday();
}
