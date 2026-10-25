import type { Metadata } from "next";
import { NoBillReturn } from "@/components/sales/no-bill-return";

export const metadata: Metadata = { title: "Return without bill" };

export default function NoBillReturnPage() {
  return <NoBillReturn />;
}
