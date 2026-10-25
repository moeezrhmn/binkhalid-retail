import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400",
        "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}
