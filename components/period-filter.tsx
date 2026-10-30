"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  encodePeriod,
  PERIOD_COOKIE,
  PERIODS,
  type Period,
  type PeriodParams,
} from "@/lib/date-filter";

/** Saved for a year, so the choice survives refreshes and moving between pages. */
function remember(params: PeriodParams) {
  document.cookie = `${PERIOD_COOKIE}=${encodePeriod(params)}; path=/; max-age=31536000; samesite=lax`;
}

/** Today / This week / This month / Custom range, as links and a small GET form. */
export function PeriodFilter({
  basePath,
  period,
  from,
  to,
  extra = {},
}: {
  basePath: string;
  period: Period;
  from?: string;
  to?: string;
  extra?: Record<string, string | undefined>;
}) {
  const href = (value: Period) => {
    const search = new URLSearchParams();
    for (const [key, v] of Object.entries(extra)) if (v) search.set(key, v);
    search.set("period", value);
    return `${basePath}?${search.toString()}`;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
        {PERIODS.filter((p) => p.value !== "custom").map((p) => (
          <Link
            key={p.value}
            href={href(p.value)}
            onClick={() => remember({ period: p.value })}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium",
              period === p.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      <form
        action={basePath}
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          const data = new FormData(e.currentTarget);
          remember({
            period: "custom",
            from: String(data.get("from") ?? ""),
            to: String(data.get("to") ?? ""),
          });
        }}
      >
        <input type="hidden" name="period" value="custom" />
        {Object.entries(extra).map(([key, v]) =>
          v ? <input key={key} type="hidden" name={key} value={v} /> : null,
        )}
        <Input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          aria-label="From date"
          className="h-8 w-36"
        />
        <span className="text-sm text-gray-400">to</span>
        <Input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          aria-label="To date"
          className="h-8 w-36"
        />
        <Button type="submit" variant={period === "custom" ? "primary" : "secondary"} size="sm">
          Show
        </Button>
      </form>
    </div>
  );
}
