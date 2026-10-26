import type { Metadata } from "next";
import { NoBillReturn } from "@/components/sales/no-bill-return";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Return without bill" };

export default async function NoBillReturnPage() {
  await requireAdmin();
  return <NoBillReturn />;
}
