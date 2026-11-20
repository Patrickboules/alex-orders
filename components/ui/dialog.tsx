"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { cn } from "./cn";

/**
 * Modal built on the native <dialog>: focus trapping, Escape to close and the
 * top layer come from the browser. `variant="sheet"` docks it to the bottom on
 * phones (centered from sm up).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "dialog",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  variant?: "dialog" | "sheet";
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const sheet = variant === "sheet";

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-ink backdrop:bg-transparent open:flex",
        "h-dvh w-full items-end justify-center sm:items-center",
        !sheet && "items-center px-4",
      )}
    >
      <div
        className={cn(
          "flex max-h-[88dvh] w-full flex-col overflow-hidden bg-paper shadow-[var(--shadow-sheet)] animate-sheet-up",
          sheet
            ? "rounded-t-[var(--radius-sheet)] sm:max-w-lg sm:rounded-[var(--radius-sheet)]"
            : "max-w-md rounded-[var(--radius-sheet)]",
          className,
        )}
      >
        {sheet ? (
          <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong sm:hidden" />
        ) : null}
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold" dir="auto">
              {title}
            </h2>
            {description ? (
              <div id={descId} className="mt-0.5 text-sm text-ink-2">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-wash hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div> : null}
        {footer ? (
          <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>
        ) : null}
      </div>
    </dialog>
  );
}

/** Bottom sheet on phones, centered panel on larger screens. */
export function Sheet(props: Omit<Parameters<typeof Dialog>[0], "variant">) {
  return <Dialog {...props} variant="sheet" />;
}

/** "Are you sure?" dialog with a single confirming action. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  tone = "primary",
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            pending={pending}
            className={tone === "danger" ? "border-danger" : undefined}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {children ? <div className="text-sm text-ink-2">{children}</div> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
