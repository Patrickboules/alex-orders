import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav, AdminNavLinks } from "@/components/admin/admin-nav";
import { Mark } from "@/components/site-header";

export const metadata: Metadata = { robots: { index: false } };

// Auth is checked by each page (requireAdmin inside its streamed content), so
// this layout stays static and renders instantly.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4">
          <Link href="/admin" className="-mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 font-semibold tracking-tight">
            <Mark />
            Alex Orders
            <span className="font-normal text-ink-3">Admin</span>
          </Link>
          <Suspense fallback={<AdminNavLinks pathname={null} />}>
            <AdminNav />
          </Suspense>
        </div>
      </header>
      {children}
    </>
  );
}
