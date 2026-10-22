import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Shop details, receipts, labels and staff." />
      <ComingSoon
        phase={3}
        items={["Shop name and receipt text", "Label size", "Staff accounts"]}
      />
    </>
  );
}
