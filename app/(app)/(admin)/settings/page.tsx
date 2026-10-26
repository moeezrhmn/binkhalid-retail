import type { Metadata } from "next";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";
import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  return <ShopSettingsForm initial={await getSettings()} />;
}
