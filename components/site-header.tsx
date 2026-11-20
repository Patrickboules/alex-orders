import Link from "next/link";
import type { ReactNode } from "react";

/** Thin top bar shared by public pages. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold tracking-tight">
          <Mark />
          Alex Orders
        </Link>
        {children}
      </div>
    </header>
  );
}

/** A torn order slip, drawn as one line. */
export function Mark() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 text-accent" aria-hidden="true">
      <path
        d="M4.5 2.5h11v14l-1.83-1.2-1.84 1.2L10 15.3l-1.83 1.2L6.33 15.3 4.5 16.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 6.5h5M7.5 9.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
