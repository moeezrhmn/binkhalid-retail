"use client";

import { useEffect, useRef, useState } from "react";

export type ColumnDatum = { key: string; label: string; detail: string; value: number };

const HEIGHT = 220;
const PAD = { top: 22, right: 8, bottom: 26, left: 52 };
const BAR_MAX = 24;
const RADIUS = 4;

/** "Rs 12K" style axis ticks. */
function compactRs(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}Rs ${+(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}Rs ${+(abs / 1_000).toFixed(1)}K`;
  return `${sign}Rs ${abs}`;
}

export const formatRsFull = (value: number) =>
  `${value < 0 ? "-" : ""}Rs ${Math.abs(value).toLocaleString("en-US")}`;

function niceStep(max: number) {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  // Whole rupees only: never a step below Rs 1.
  return Math.max(
    1,
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((step) => step >= raw) ?? power * 10,
  );
}

/** Column with a rounded data end and a square baseline end (handles negatives). */
function columnPath(x: number, width: number, y0: number, y1: number) {
  const up = y1 < y0;
  const h = Math.abs(y1 - y0);
  const r = Math.min(RADIUS, h, width / 2);
  if (h === 0) return "";
  const top = up ? y1 : y0;
  const bottom = up ? y0 : y1;
  return up
    ? `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + width - r} Q${x + width},${top} ${x + width},${top + r} V${bottom} Z`
    : `M${x},${top} V${bottom - r} Q${x},${bottom} ${x + r},${bottom} H${x + width - r} Q${x + width},${bottom} ${x + width},${bottom - r} V${top} Z`;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Single-series column chart (e.g. sales per day). Values are rupees. */
export function ColumnChart({ data, label }: { data: ColumnDatum[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  // With no sales at all, a Rs 0–1,000 scale reads better than Rs 0–1.
  const step = niceStep(max - min || 1000);
  const top = Math.ceil(max / step) * step || step;
  const bottom = Math.floor(min / step) * step;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + ((top - v) / (top - bottom)) * plotH;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(BAR_MAX, Math.max(4, band * 0.6));
  const ticks: number[] = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 56)));
  const peak = data.reduce(
    (best, d, i) => (d.value > (data[best]?.value ?? -Infinity) ? i : best),
    0,
  );
  const tip = active !== null ? data[active] : null;

  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setActive(null)}>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={label}
            className="block overflow-visible"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-gray-200)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-gray-500 text-[11px] tabular-nums"
                >
                  {compactRs(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + band * i + band / 2;
              return (
                <g key={d.key}>
                  <path
                    d={columnPath(cx - barW / 2, barW, y(0), y(d.value))}
                    fill={active === i ? "var(--color-chart-hover)" : "var(--color-chart)"}
                  />
                  {i % labelEvery === 0 ? (
                    <text
                      x={cx}
                      y={HEIGHT - 8}
                      textAnchor="middle"
                      className="fill-gray-500 text-[11px]"
                    >
                      {d.label}
                    </text>
                  ) : null}
                  {i === peak && d.value > 0 ? (
                    <text
                      x={cx}
                      y={y(d.value) - 6}
                      textAnchor="middle"
                      className="fill-gray-700 text-[11px] font-semibold tabular-nums"
                    >
                      {compactRs(d.value)}
                    </text>
                  ) : null}
                  <rect
                    x={PAD.left + band * i}
                    y={PAD.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="graphics-symbol"
                    aria-label={`${d.detail}: ${formatRsFull(d.value)}`}
                    onPointerMove={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="cursor-default outline-none"
                  />
                </g>
              );
            })}
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--color-gray-300)"
              strokeWidth={1}
            />
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} />
        )}
        {tip && active !== null ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
            style={{
              left: Math.min(Math.max(PAD.left + band * active + band / 2, 70), width - 70),
              top: Math.max(0, y(Math.max(tip.value, 0)) - 52),
            }}
          >
            <p className="text-sm font-semibold text-gray-900 tabular-nums">
              {formatRsFull(tip.value)}
            </p>
            <p className="text-gray-500">{tip.detail}</p>
          </div>
        ) : null}
      </div>
      <ChartTable rows={data.map((d) => [d.detail, formatRsFull(d.value)])} />
    </div>
  );
}

export function ChartTable({ rows }: { rows: [string, string][] }) {
  return (
    <details className="mt-1 text-xs text-gray-500 print:hidden">
      <summary className="cursor-pointer select-none hover:text-gray-700">Show as table</summary>
      <table className="mt-1 w-full">
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name} className="border-b border-gray-100">
              <td className="py-1 text-gray-700">{name}</td>
              <td className="py-1 text-right text-gray-900 tabular-nums">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
