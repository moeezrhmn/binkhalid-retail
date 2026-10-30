import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * White surface with exactly the white button's edge (--shadow-btn). The edge is
 * drawn on a layer above the content, so a table header or a coloured row at the
 * edge of the card never hides it. Print gets a plain thin border instead.
 */
export const cardClasses = cn(
  "relative rounded-lg bg-white",
  "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-[inherit] after:shadow-btn after:content-['']",
  "print:border print:border-gray-300 print:after:hidden",
);

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardClasses, className)} {...props} />;
}
