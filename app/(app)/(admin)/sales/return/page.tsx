import type { Metadata } from "next";
import { NoBillReturn } from "@/components/sales/no-bill-return";
import { currentSession } from "@/server/services/cash";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Return without bill" };

export default async function NoBillReturnPage() {
  await requireAdmin();
  return <NoBillReturn dayOpen={Boolean(await currentSession())} />;
}
