"use client";

import { useEffect } from "react";

/** Opens the print dialog once the receipt has loaded (used when printing straight from POS). */
export function AutoPrint() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 50);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
