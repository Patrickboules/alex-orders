import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RestaurantCard } from "@/components/restaurant-card";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { getAdminRestaurants, type AdminRestaurantSummary } from "@/lib/actions/queries";

export const metadata: Metadata = { title: "Restaurants" };

export default function AdminRestaurantsPage() {
  return (
    <Suspense fallback={<PageSkeleton wide />}>
      <RestaurantList />
    </Suspense>
  );
}

function statusMeta(r: AdminRestaurantSummary) {
  if (r.menuStatus === "published") {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>{r.itemCount} items</span>
        {r.draftItemCount > 0 && r.draftItemCount !== r.itemCount ? <Badge>Unpublished edits</Badge> : null}
      </span>
    );
  }
  if (r.menuStatus === "draft") {
    return (
      <span className="flex items-center gap-2">
        <Badge tone="warn">Draft</Badge> {r.draftItemCount} items to review
      </span>
    );
  }
  return <span>No menu yet</span>;
}

async function RestaurantList() {
  const restaurants = await getAdminRestaurants();

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Restaurants</h1>
          <p className="mt-1 text-sm text-ink-2">Only restaurants with a published menu appear on the public site.</p>
        </div>
        <Link href="/admin/restaurants/new" className={buttonClasses("primary")}>
          New restaurant
        </Link>
      </div>

      {restaurants.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="No restaurants yet"
            action={
              <Link href="/admin/restaurants/new" className={buttonClasses("primary")}>
                Add the first one
              </Link>
            }
          >
            Add a restaurant, upload its menu, and you can start a group order.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {restaurants.map((r) => (
            <li key={r.id}>
              <RestaurantCard
                restaurant={{ ...r, openOrderShortCode: r.openOrder?.shortCode }}
                href={`/admin/restaurants/${r.id}`}
                meta={statusMeta(r)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
