import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Admin login", robots: { index: false } };

export default function AdminLoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 pt-14 pb-20">
        <h1 className="text-xl font-semibold tracking-tight">Admin login</h1>
        <p className="mt-1 mb-8 text-sm text-ink-2">For the people who set up menus and run group orders.</p>
        <LoginForm />
      </main>
    </>
  );
}
