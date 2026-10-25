"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Underlined tabs for the sub-pages of a section. `exact` tabs only match their own path. */
export function SectionTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; exact?: boolean }[];
}) {
  const pathname = usePathname();
  const active = (tab: (typeof tabs)[number]) =>
    tab.exact
      ? pathname === tab.href
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-gray-200">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab) ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-1.5 text-sm font-medium whitespace-nowrap",
            active(tab)
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
