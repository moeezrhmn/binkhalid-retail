"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

/** Modal built on the native <dialog>: focus trapping and Escape come from the browser. */
export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold text-gray-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-gray-500 hover:bg-gray-100"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="px-4 py-3">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">{footer}</div>
      ) : null}
    </dialog>
  );
}
