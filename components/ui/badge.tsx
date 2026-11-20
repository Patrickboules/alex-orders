import type { HTMLAttributes } from "react";
import { cn } from "./cn";

type Tone = "open" | "neutral" | "warn" | "danger" | "paid";

const tones: Record<Tone, string> = {
  open: "bg-accent-wash text-accent",
  paid: "bg-accent-wash text-accent",
  neutral: "bg-wash-2 text-ink-2",
  warn: "bg-warn-wash text-warn",
  danger: "bg-danger-wash text-danger",
};

export function Badge({
  tone = "neutral",
  dot,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
