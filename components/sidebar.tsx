"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Barcode,
  BarChart3,
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly: boolean };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/pos", label: "POS / Billing", icon: ShoppingCart, adminOnly: false },
  { href: "/sales", label: "Sales", icon: ReceiptText, adminOnly: true },
  { href: "/products", label: "Products", icon: Package, adminOnly: true },
  { href: "/barcodes", label: "Barcode Labels", icon: Barcode, adminOnly: true },
  { href: "/inventory", label: "Inventory", icon: Boxes, adminOnly: true },
  { href: "/customers", label: "Customers", icon: Users, adminOnly: true },
  { href: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

/**
 * From the md breakpoint up the sidebar is always visible. On phones it is a
 * drawer opened from the top bar, for quick lookups away from the counter.
 */
export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => user.type === "ADMIN" || !item.adminOnly);
  const current = items.find((item) => isActive(pathname, item.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 bg-brand-900 px-3 text-white md:hidden print:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="main-sidebar"
          className="-ml-2 rounded-lg p-2 hover:bg-brand-800"
        >
          <Menu className="size-6" aria-hidden />
        </button>
        <p className="font-semibold">{current?.label ?? "Bin Khalid"}</p>
      </header>

      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      <aside
        id="main-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-brand-900 text-brand-100 transition-transform md:sticky md:top-0 md:h-screen md:w-52 md:shrink-0 md:translate-x-0 print:hidden",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between px-4 py-4">
          <div>
            <p className="text-lg font-semibold text-white">Bin Khalid</p>
            <p className="text-xs text-gold-300">Retail Management</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="-mr-2 rounded-lg p-1.5 text-brand-100 hover:bg-brand-800 md:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-gold-500 text-brand-950"
                    : "text-brand-100 hover:bg-brand-800 hover:text-white",
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-brand-800 p-3">
          <div className="px-3 pb-3">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-xs text-brand-100/70">{user.type === "ADMIN" ? "Admin" : "Staff"}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800 hover:text-white"
            >
              <LogOut className="size-[18px]" aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
