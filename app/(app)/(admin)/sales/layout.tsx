import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function SalesLayout({ children }: LayoutProps<"/sales">) {
  return (
    <>
      <PageHeader title="Sales" description="Bill history, reprints, returns and exchanges." />
      <SectionTabs
        label="Sales sections"
        tabs={[
          { href: "/sales", label: "Bills", exact: true },
          { href: "/sales/return", label: "Return without bill" },
        ]}
      />
      {children}
    </>
  );
}
