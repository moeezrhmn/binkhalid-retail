import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";

export default function InventoryLayout({ children }: LayoutProps<"/inventory">) {
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock levels, stock in, adjustments and history."
      />
      <SectionTabs
        label="Inventory sections"
        tabs={[
          { href: "/inventory", label: "Stock", exact: true },
          { href: "/inventory/stock-in", label: "Stock in" },
          { href: "/inventory/movements", label: "Movements" },
          { href: "/inventory/suppliers", label: "Suppliers" },
        ]}
      />
      {children}
    </>
  );
}
