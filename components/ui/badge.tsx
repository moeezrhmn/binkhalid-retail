import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "gray" | "green" | "gold" | "red" | "blue";

const tones: Record<Tone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-brand-50 text-brand-700",
  gold: "bg-gold-300/40 text-gold-600",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
