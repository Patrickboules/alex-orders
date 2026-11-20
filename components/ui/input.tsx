import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-[var(--radius-control)] border border-line-strong bg-paper px-3 text-base text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent aria-[invalid=true]:border-danger disabled:bg-wash disabled:text-ink-2";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "min-h-11", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-20 py-2.5 leading-6", className)} {...rest} />;
}

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-medium">
      <span>{children}</span>
      {hint ? <span className="text-xs font-normal text-ink-3">{hint}</span> : null}
    </label>
  );
}

/** Label + control + help or error text, wired together for screen readers. */
export function Field({
  id,
  label,
  hint,
  help,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  help?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-1.5 text-sm text-ink-2">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] bg-danger-wash px-3 py-2.5 text-sm text-danger">
      {children}
    </p>
  );
}
