import Link from "next/link";
import { Suspense } from "react";
import { RestaurantCard } from "@/components/restaurant-card";
import { SiteHeader } from "@/components/site-header";
import { EmptyState } from "@/components/ui/card";
import { getHomeData } from "@/lib/actions/queries";

export default function HomePage() {
  return (
    <>
      <SiteHeader>
        <Link href="/admin" className="-mx-2 flex min-h-11 items-center rounded-md px-2 text-sm text-ink-2 hover:text-ink">
          Admin
        </Link>
      </SiteHeader>
      <main className="mx-auto max-w-5xl px-4 pt-10 pb-20 sm:pt-14">
        <h1 className="max-w-xl text-xl font-semibold tracking-tight sm:text-2xl">What are we ordering?</h1>
        <p className="mt-2 max-w-xl text-ink-2">
          Pick a restaurant to see its menu. If someone has started a group order, join it and add what you want.
        </p>
        <Suspense fallback={<GridSkeleton />}>
          <Restaurants />
        </Suspense>
      </main>
    </>
  );
}

async function Restaurants() {
  const restaurants = await getHomeData();

  if (restaurants.length === 0) {
    return (
      <div className="mt-10">
        <EmptyState title="No restaurants yet">Once an admin publishes a menu, it shows up here.</EmptyState>
      </div>
    );
  }

  const open = restaurants.filter((r) => r.openOrderShortCode);
  const rest = restaurants.filter((r) => !r.openOrderShortCode);

  return (
    <>
      {open.length > 0 ? (
        <section aria-labelledby="open-now" className="mt-10">
          <h2 id="open-now" className="text-sm font-semibold text-accent">
            Ordering now
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-box)] border border-line">
            {open.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/o/${r.openOrderShortCode}`}
                  className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 hover:bg-wash"
                >
                  <span className="min-w-0 truncate font-medium" dir="auto">
                    {r.name}
                  </span>
                  <span className="shrink-0 text-sm font-medium text-accent">Join order</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="all-restaurants" className="mt-10">
        <h2 id="all-restaurants" className="sr-only">
          Restaurants
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...open, ...rest].map((r) => (
            <li key={r.id}>
              <RestaurantCard restaurant={r} href={`/r/${r.id}`} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function GridSkeleton() {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Loading restaurants">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius-box)] border border-line">
          <div className="aspect-[16/10] animate-pulse bg-wash motion-reduce:animate-none" />
          <div className="space-y-2 p-4">
            <div className="h-4 w-2/3 rounded bg-wash-2" />
            <div className="h-3 w-1/3 rounded bg-wash" />
          </div>
        </div>
      ))}
    </div>
  );
}
