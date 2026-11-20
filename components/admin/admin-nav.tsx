"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/components/ui/cn";
import { logoutAdmin } from "@/lib/actions/admin";

const links = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/restaurants", label: "Restaurants", exact: false },
];

export function AdminNav() {
  return <AdminNavLinks pathname={usePathname()} />;
}

/** Rendered without a pathname as the Suspense fallback during prerendering. */
export function AdminNavLinks({ pathname }: { pathname: string | null }) {
  const [pending, start] = useTransition();

  return (
    <nav aria-label="Admin" className="flex items-center gap-1">
      {links.map((l) => {
        const active = pathname ? (l.exact ? pathname === l.href : pathname.startsWith(l.href)) : false;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors duration-150",
              active ? "bg-wash-2 text-ink" : "text-ink-2 hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await logoutAdmin();
          })
        }
        className="ms-1 flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-sm text-ink-2 hover:text-ink disabled:opacity-50"
      >
        Log out
      </button>
    </nav>
  );
}
