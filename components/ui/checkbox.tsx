import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode };

export function Checkbox({ label, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-gray-700", className)}>
      <input
        type="checkbox"
        className="size-4 rounded border-gray-300 accent-brand-700 disabled:opacity-50"
        {...props}
      />
      {label}
    </label>
  );
}
