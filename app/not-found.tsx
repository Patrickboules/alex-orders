import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-20">
        <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
        <p className="mt-2 text-ink-2">
          This link doesn’t match a restaurant or order. It may have been mistyped, or the order was removed.
        </p>
        <Link href="/" className={buttonClasses("secondary", "md", "mt-6")}>
          See all restaurants
        </Link>
      </main>
    </>
  );
}
