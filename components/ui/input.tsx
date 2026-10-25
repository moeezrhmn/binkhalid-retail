"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-gray-300 bg-white px-2.5 text-sm text-gray-900 placeholder:text-gray-400",
        "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none",
        "disabled:bg-gray-100 disabled:text-gray-500 aria-invalid:border-red-500",
        className,
      )}
      {...props}
    />
  );
}

type FieldProps = ComponentProps<"input"> & {
  label: string;
  hint?: ReactNode;
  error?: string;
};

/** A labelled input with optional hint and error text. */
export function Field({ label, hint, error, id, className, ...props }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-600">
        {label}
      </label>
      <Input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        {...props}
      />
      {error ? (
        <p id={messageId} className="text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
