"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/products", label: "Products" },
  { href: "/products/quick-add", label: "Quick add" },
  { href: "/products/categories", label: "Categories" },
];

export function ProductsTabs() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/products"
      ? pathname === "/products" || /^\/products\/(new|[0-9a-f-]{36})/.test(pathname)
      : pathname.startsWith(href);

  return (
    <nav aria-label="Products sections" className="mb-6 flex gap-1 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab.href) ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium",
            active(tab.href)
              ? "border-gold-500 text-brand-800"
              : "border-transparent text-gray-500 hover:text-gray-800",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
