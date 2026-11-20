import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-[var(--radius-box)] border border-line bg-paper", className)}
      {...rest}
    />
  );
}

/** A titled section of a page: heading on the left, optional actions on the right. */
export function SectionHeading({
  title,
  description,
  actions,
  as: Tag = "h2",
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <Tag className={Tag === "h1" ? "text-xl font-semibold tracking-tight" : "text-lg font-semibold"}>
          {title}
        </Tag>
        {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-box)] border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
