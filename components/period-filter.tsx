import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PERIODS, type Period } from "@/lib/date-filter";

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
    if (value !== "today") search.set("period", value);
    const text = search.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
        {PERIODS.filter((p) => p.value !== "custom").map((p) => (
          <Link
            key={p.value}
            href={href(p.value)}
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
      <form action={basePath} className="flex items-center gap-1.5">
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
