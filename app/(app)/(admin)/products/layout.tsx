import { PageHeader } from "@/components/page-header";
import { ProductsTabs } from "@/components/products/products-tabs";

export default function ProductsLayout({ children }: LayoutProps<"/products">) {
  return (
    <>
      <PageHeader title="Products" description="Categories, products, variants and their codes." />
      <ProductsTabs />
      {children}
    </>
  );
}
