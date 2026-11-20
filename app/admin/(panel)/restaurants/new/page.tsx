import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RestaurantForm } from "@/components/admin/restaurant-form";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "New restaurant" };

export default function NewRestaurantPage() {
  return (
    <main className="mx-auto max-w-lg px-4 pt-8 pb-20">
      <Link href="/admin/restaurants" className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-ink-2 hover:text-ink">
        Restaurants
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">New restaurant</h1>
      <p className="mt-1 mb-8 text-sm text-ink-2">Next, you’ll upload its menu.</p>
      <Suspense fallback={null}>
        <Guarded />
      </Suspense>
    </main>
  );
}

async function Guarded() {
  await requireAdmin();
  return <RestaurantForm />;
}
