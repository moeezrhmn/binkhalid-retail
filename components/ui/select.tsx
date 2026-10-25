import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900",
        "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none",
        "disabled:bg-gray-100 disabled:text-gray-500",
        className,
      )}
      {...props}
    />
  );
}
