import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const tones = {
  error: "bg-red-50 text-red-700 border-red-200",
  success: "bg-brand-50 text-brand-700 border-brand-100",
  info: "bg-gray-50 text-gray-700 border-gray-200",
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", tones[tone], className)}
    >
      {children}
    </div>
  );
}
