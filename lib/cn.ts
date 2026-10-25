import { twMerge } from "tailwind-merge";

/** Joins class names, skipping falsy values. Later classes win over conflicting earlier ones. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
