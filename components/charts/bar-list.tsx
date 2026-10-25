"use client";

import { useState } from "react";
import { ChartTable, formatRsFull } from "./column-chart";

export type BarDatum = { key: string; label: string; value: number; share?: number };

/**
 * Horizontal bars for a short ranked list (e.g. sales by category). Each row is
 * its own hit target with a tooltip; the value sits at the bar tip.
 */
export function BarList({ data, label }: { data: BarDatum[]; label: string }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  if (data.length === 0)
    return <p className="py-8 text-center text-sm text-gray-500">No sales in this period.</p>;

  return (
    <div>
      <ul aria-label={label} className="space-y-2.5">
        {data.map((d) => {
          const width = d.value > 0 ? Math.max(2, (d.value / max) * 100) : 0;
          return (
            <li
              key={d.key}
              tabIndex={0}
              aria-label={`${d.label}: ${formatRsFull(d.value)}${d.share !== undefined ? `, ${d.share}% of sales` : ""}`}
              onPointerEnter={() => setActive(d.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              className="relative outline-none"
            >
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-gray-700">{d.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 min-w-0 flex-1">
                  <div
                    className="h-3 rounded-r-[4px] transition-colors"
                    style={{
                      width: `${width}%`,
                      background:
                        active === d.key ? "var(--color-chart-hover)" : "var(--color-chart)",
                    }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-xs font-semibold text-gray-900 tabular-nums">
                  {formatRsFull(d.value)}
                </span>
              </div>
              {active === d.key && d.share !== undefined ? (
                <div className="pointer-events-none absolute -top-1 right-28 z-10 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs shadow-md">
                  <p className="text-sm font-semibold text-gray-900 tabular-nums">
                    {d.share}% of sales
                  </p>
                  <p className="text-gray-500">{d.label}</p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ChartTable rows={data.map((d) => [d.label, formatRsFull(d.value)])} />
    </div>
  );
}
