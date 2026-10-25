import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <PageHeader title="Settings" description="Shop details, printing and staff accounts." />
      <SectionTabs
        label="Settings sections"
        tabs={[
          { href: "/settings", label: "Shop and printing", exact: true },
          { href: "/settings/staff", label: "Staff accounts" },
        ]}
      />
      {children}
    </>
  );
}
