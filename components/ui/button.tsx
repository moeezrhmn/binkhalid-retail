import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

// Raised look: shadows come from the --shadow-btn* tokens in globals.css. A soft
// top-to-bottom sheen sits over the base color; pressing swaps to an inset shadow.
const variants: Record<Variant, string> = {
  primary:
    "bg-brand-700 bg-linear-to-b from-white/10 to-transparent text-white shadow-btn-primary hover:bg-brand-800 active:bg-brand-800 active:from-transparent active:shadow-btn-primary-pressed",
  secondary:
    "bg-white text-gray-900 shadow-btn hover:bg-gray-50 active:bg-gray-100 active:shadow-btn-pressed",
  danger:
    "bg-red-600 bg-linear-to-b from-white/10 to-transparent text-white shadow-btn-danger hover:bg-red-700 active:bg-red-700 active:from-transparent active:shadow-btn-danger-pressed",
  ghost: "text-gray-700 hover:bg-gray-900/5 active:bg-gray-900/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-12 px-5 text-base",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function buttonClasses({
  variant = "primary",
  size = "md",
}: Pick<ButtonProps, "variant" | "size"> = {}) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap select-none",
    "transition-[background-color,box-shadow] duration-100",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    variants[variant],
    sizes[size],
  );
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonClasses({ variant, size }), className)} {...props} />
  );
}
