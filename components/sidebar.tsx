"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import type { CurrentUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatRs } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/roles";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import type { SidebarStatus } from "@/server/services/sidebar";

type SubItem = { href: string; label: string; match?: (pathname: string) => boolean };
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
  lowStockBadge?: boolean;
  sub?: SubItem[];
};

const exact = (href: string) => (pathname: string) => pathname === href;

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Selling",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
      { href: "/pos", label: "POS / Billing", icon: ShoppingCart, adminOnly: false },
      {
        href: "/sales",
        label: "Sales",
        icon: ReceiptText,
        adminOnly: true,
        sub: [
          {
            href: "/sales",
            label: "Bills",
            match: (p) => p === "/sales" || /^\/sales\/[0-9a-f-]{36}/.test(p),
          },
          { href: "/sales/return", label: "Return without bill" },
        ],
      },
      { href: "/cash", label: "Cash Register", icon: Wallet, adminOnly: true },
    ],
  },
  {
    title: "Catalog",
    items: [
      {
        href: "/products",
        label: "Products",
        icon: Package,
        adminOnly: true,
        sub: [
          {
            href: "/products",
            label: "Products",
            match: (p) => p === "/products" || /^\/products\/(new|[0-9a-f-]{36})/.test(p),
          },
          { href: "/products/quick-add", label: "Quick add" },
          { href: "/products/categories", label: "Categories" },
        ],
      },
      { href: "/barcodes", label: "Barcode Labels", icon: Barcode, adminOnly: true },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        adminOnly: true,
        lowStockBadge: true,
        sub: [
          { href: "/inventory", label: "Stock", match: exact("/inventory") },
          { href: "/inventory/stock-in", label: "Stock in" },
          { href: "/inventory/movements", label: "Movements" },
          { href: "/inventory/suppliers", label: "Suppliers" },
        ],
      },
    ],
  },
  {
    title: "People & insights",
    items: [
      { href: "/customers", label: "Customers", icon: Users, adminOnly: true },
      { href: "/reports", label: "Reports", icon: BarChart3, adminOnly: true },
    ],
  },
];

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
  adminOnly: true,
  sub: [
    { href: "/settings", label: "Shop and printing", match: exact("/settings") },
    { href: "/settings/users", label: "Users" },
  ],
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Label shown beside the folded rail on hover (desktop only). */
function Tip({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-1/2 left-full z-50 ml-3 hidden -translate-y-1/2 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
        show && "md:block",
      )}
    >
      {children}
    </span>
  );
}

/**
 * Light rail with sections. From the md breakpoint up it is always visible and
 * can fold to icons only ([ key or the Collapse button). On phones it is a
 * drawer opened from the top bar, always unfolded.
 */
export function Sidebar({
  user,
  initialStatus,
  initialCollapsed,
}: {
  user: CurrentUser;
  initialStatus: SidebarStatus;
  initialCollapsed: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const isAdmin = user.type === "ADMIN";

  // The layout sends fresh status after every save; page changes fetch it too,
  // which also picks up sales made on another computer.
  const [status, setStatus] = useState(initialStatus);
  const [seenInitial, setSeenInitial] = useState(initialStatus);
  if (initialStatus !== seenInitial) {
    setSeenInitial(initialStatus);
    setStatus(initialStatus);
  }
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch("/sidebar-status", { signal: controller.signal, cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((next: SidebarStatus | null) => next && setStatus(next))
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => {
      controller.abort();
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

  const toggle = useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) setOpen(false);
      if (event.key !== "[" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector("dialog[open]")) return;
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, toggle]);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((group) => group.items.length > 0);
  const all = [...groups.flatMap((g) => g.items), ...(isAdmin ? [SETTINGS] : [])];
  const current = all.find((item) => isActive(pathname, item.href));
  const lowStock = status.lowStock ?? 0;

  const renderItem = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    const Icon = item.icon;
    const badge = item.lowStockBadge && lowStock > 0 ? `${lowStock} low` : null;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={() => setOpen(false)}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex h-8 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors",
            collapsed && "md:justify-center md:px-0",
            active
              ? "bg-white font-semibold text-gray-900 shadow-btn"
              : "text-gray-700 hover:bg-black/5 hover:text-gray-900",
          )}
        >
          {active ? (
            <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-gold-500" />
          ) : null}
          <Icon
            className={cn("size-4 shrink-0", active ? "text-brand-700" : "text-gray-500")}
            aria-hidden
          />
          <span className={cn(collapsed && "md:sr-only")}>{item.label}</span>
          {badge ? (
            <>
              <span
                className={cn(
                  "ml-auto rounded-md bg-amber-100 px-1.5 text-[10.5px] font-semibold text-amber-800",
                  collapsed && "md:hidden",
                )}
              >
                {badge}
              </span>
              <span
                className={cn(
                  "absolute top-1 right-2.5 hidden size-2 rounded-full bg-amber-500 ring-2 ring-rail",
                  collapsed && "md:block",
                )}
              />
            </>
          ) : null}
          <Tip show={collapsed}>{badge ? `${item.label} · ${badge}` : item.label}</Tip>
        </Link>
        {active && item.sub ? (
          <ul
            className={cn(
              "mt-px mb-1 ml-[1.1rem] space-y-px border-l border-gray-300 pl-3",
              collapsed && "md:hidden",
            )}
          >
            {item.sub.map((sub) => {
              const on = sub.match ? sub.match(pathname) : isActive(pathname, sub.href);
              return (
                <li key={sub.href}>
                  <Link
                    href={sub.href}
                    onClick={() => setOpen(false)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex h-7 items-center rounded-md px-2 text-[13px]",
                      on ? "font-semibold text-gray-900" : "text-gray-600 hover:bg-black/5",
                    )}
                  >
                    {sub.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </li>
    );
  };

  const dayDetail = status.day.open
    ? isAdmin && status.expectedCash !== null
      ? `${formatRs(status.expectedCash)} expected in drawer`
      : "Sales can be completed"
    : isAdmin
      ? "Open it in Cash Register"
      : "Ask an admin to open it";
  const dayTip = status.day.open
    ? `Day open · since ${status.day.since}${isAdmin && status.expectedCash !== null ? ` · ${formatRs(status.expectedCash)} in drawer` : ""}`
    : "Day closed";
  const dot = (size: string) => (
    <span className={cn("relative flex", size)}>
      {status.day.open ? (
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-50" />
      ) : null}
      <span
        className={cn(
          "relative inline-flex rounded-full",
          size,
          status.day.open ? "bg-emerald-500" : "bg-red-500",
        )}
      />
    </span>
  );
  const dayCard = (
    <>
      <div className={cn("rounded-lg bg-white px-3 py-2 shadow-pill", collapsed && "md:hidden")}>
        <div className="flex items-center gap-2 text-[12px] font-medium text-gray-900">
          {dot("size-2")}
          {status.day.open ? "Day open" : "Day closed"}
          {status.day.since ? (
            <span className="ml-auto text-gray-400">{status.day.since}</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] text-gray-500">{dayDetail}</p>
      </div>
      <div
        className={cn(
          "group relative mx-auto hidden size-10 place-items-center rounded-lg bg-white shadow-pill",
          collapsed && "md:grid",
        )}
      >
        {dot("size-2.5")}
        <span className="sr-only">{dayTip}</span>
        <Tip show={collapsed}>{dayTip}</Tip>
      </div>
    </>
  );

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
        <span className="ml-auto">{dot("size-2.5")}</span>
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
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-black/5 bg-rail transition-[transform,width] duration-200 md:sticky md:top-0 md:h-screen md:shrink-0 md:translate-x-0 print:hidden",
          collapsed ? "md:w-16" : "md:w-60",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center gap-2.5 px-3",
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-linear-to-b from-brand-700 to-brand-900 text-[12px] font-bold text-gold-300 shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.2)]">
            BK
          </div>
          <div className={cn("leading-tight", collapsed && "md:hidden")}>
            <p className="text-[15px] font-semibold tracking-tight text-gray-900">Bin Khalid</p>
            <p className="text-[11px] text-gray-500">Retail Management</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="-mr-1 ml-auto rounded-lg p-1.5 text-gray-500 hover:bg-black/5 md:hidden"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 px-2 pb-3">
          {isAdmin ? (
            <Link href="/cash" onClick={() => setOpen(false)} className="block">
              {dayCard}
            </Link>
          ) : (
            dayCard
          )}
        </div>

        <nav
          aria-label="Main"
          className={cn("flex-1 overflow-y-auto px-2 pb-3", collapsed && "md:overflow-visible")}
        >
          {groups.map((group, index) => (
            <div key={group.title} className={cn(index > 0 && "mt-3")}>
              <p
                className={cn(
                  "mb-1 px-2.5 text-[10.5px] font-semibold tracking-wider text-gray-500 uppercase",
                  collapsed && "md:hidden",
                )}
              >
                {group.title}
              </p>
              {index > 0 ? (
                <div
                  className={cn(
                    "mx-3 mb-2 hidden border-t border-black/10",
                    collapsed && "md:block",
                  )}
                />
              ) : null}
              <ul className="space-y-px">{group.items.map(renderItem)}</ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 space-y-1 border-t border-black/[0.07] p-2">
          {isAdmin ? <ul className="space-y-px">{renderItem(SETTINGS)}</ul> : null}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "group relative hidden h-8 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-gray-600 hover:bg-black/5 hover:text-gray-900 md:flex",
              collapsed && "md:justify-center md:px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0 text-gray-500" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4 shrink-0 text-gray-500" aria-hidden />
            )}
            <span className={cn(collapsed && "md:hidden")}>Collapse</span>
            <kbd
              className={cn(
                "ml-auto rounded border border-gray-300 bg-white px-1.5 font-sans text-[10px] text-gray-500",
                collapsed && "md:hidden",
              )}
            >
              [
            </kbd>
            <Tip show={collapsed}>Expand sidebar · [</Tip>
          </button>
          <div
            className={cn(
              "group relative flex items-center gap-2.5 rounded-lg bg-white p-2 shadow-pill",
              collapsed && "md:justify-center md:p-1.5",
            )}
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-linear-to-b from-brand-600 to-brand-800 text-[11px] font-semibold text-white ring-2 ring-gold-400/50">
              {initials(user.name)}
            </div>
            <div className={cn("min-w-0 leading-tight", collapsed && "md:sr-only")}>
              <p className="truncate text-[13px] font-medium text-gray-900">{user.name}</p>
              <p className="text-[11px] text-gray-500">{ROLE_LABELS[user.type]}</p>
            </div>
            <form action={logout} className={cn("ml-auto", collapsed && "md:hidden")}>
              <button
                type="submit"
                title="Log out"
                aria-label="Log out"
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
            <Tip show={collapsed}>
              {user.name} · {ROLE_LABELS[user.type]}
            </Tip>
          </div>
          {collapsed ? (
            <form action={logout} className="hidden md:block">
              <button
                type="submit"
                aria-label="Log out"
                className="group relative flex h-8 w-full items-center justify-center rounded-lg text-gray-500 hover:bg-black/5 hover:text-gray-900"
              >
                <LogOut className="size-4" aria-hidden />
                <Tip show>Log out</Tip>
              </button>
            </form>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
  ).toUpperCase();
}
