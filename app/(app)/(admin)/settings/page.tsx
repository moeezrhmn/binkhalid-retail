import type { Metadata } from "next";
import { ShopSettingsForm } from "@/components/settings/shop-settings-form";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  return <ShopSettingsForm initial={await getSettings()} />;
}
