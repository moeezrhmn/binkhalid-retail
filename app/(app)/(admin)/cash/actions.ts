"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { closeSession, openSession, recordDrawerOut } from "@/server/services/cash";
import { toResult, type Result } from "@/server/services/errors";

const int = (value: unknown) => Number(String(value).replace(/[,\s]/g, ""));

export async function openDayAction(openingCash: string): Promise<Result<null>> {
  await requireAdmin();
  const result = await toResult(async () => {
    await openSession(int(openingCash));
    return null;
  });
  revalidatePath("/cash");
  return result;
}

export async function drawerOutAction(input: {
  type: "CASH_OUT" | "EXPENSE";
  amount: string;
  note: string;
}): Promise<Result<null>> {
  const user = await requireAdmin();
  if (input.type !== "CASH_OUT" && input.type !== "EXPENSE")
    return { ok: false, error: "Unknown type" };
  const result = await toResult(async () => {
    await recordDrawerOut({
      type: input.type,
      amount: int(input.amount),
      note: String(input.note),
      userId: user.id,
    });
    return null;
  });
  revalidatePath("/cash");
  return result;
}

export async function closeDayAction(
  countedCash: string,
  note: string,
): Promise<Result<{ id: string }>> {
  await requireAdmin();
  const result = await toResult(async () => {
    const session = await closeSession(int(countedCash), String(note));
    return { id: session.id };
  });
  revalidatePath("/cash");
  return result;
}
