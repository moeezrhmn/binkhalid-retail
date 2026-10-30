"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

export type ConfirmOptions = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for actions that remove or end something. */
  tone?: "primary" | "danger";
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Styled replacement for window.confirm(): `if (!(await confirm({...}))) return;` */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm needs a <ConfirmProvider> above it.");
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }, []);

  const confirm = useCallback<Confirm>((next) => {
    resolver.current?.(false);
    setOptions(next);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // The dialog opens in its own effect, which runs before this one; Enter then confirms.
  useEffect(() => {
    if (options) confirmRef.current?.focus();
  }, [options]);

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              ref={confirmRef}
              variant={options?.tone === "danger" ? "danger" : "primary"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "Continue"}
            </Button>
          </>
        }
      >
        {options?.message ? <div className="text-sm text-gray-700">{options.message}</div> : null}
      </Dialog>
    </ConfirmContext>
  );
}
