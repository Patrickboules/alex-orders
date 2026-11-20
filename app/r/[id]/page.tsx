import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { ReadOnlyMenu } from "@/components/menu/read-only-menu";
import { RestaurantCover } from "@/components/restaurant-card";
import { SiteHeader } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";
import { PageSkeleton } from "@/components/skeletons";
import { getRestaurantPage } from "@/lib/actions/queries";

const load = cache(getRestaurantPage);

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const data = await load((await params).id);
  return { title: data?.restaurant.name ?? "Restaurant not found" };
}

export default function RestaurantPage({ params }: PageProps<"/r/[id]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<PageSkeleton />}>
        <RestaurantContent params={params} />
      </Suspense>
    </>
  );
}

async function RestaurantContent({ params }: { params: PageProps<"/r/[id]">["params"] }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { restaurant, openOrder } = data;

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <div className="flex items-center gap-4">
        <RestaurantCover
          name={restaurant.name}
          url={restaurant.coverImageUrl}
          className="size-16 shrink-0 rounded-[var(--radius-box)] border border-line [&_span]:text-2xl"
        />
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight" dir="auto">
            {restaurant.name}
          </h1>
          <p className="text-sm text-ink-2">
            {restaurant.itemCount} items
            {restaurant.phone ? (
              <>
                {", "}
                <a href={`tel:${restaurant.phone}`} className="underline-offset-4 hover:underline" dir="ltr">
                  {restaurant.phone}
                </a>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {openOrder ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-box)] border border-accent/30 bg-accent-wash p-4">
          <div className="min-w-0">
            <p className="font-medium text-accent">A group order is open</p>
            <p className="truncate text-sm text-ink-2" dir="auto">
              {openOrder.title}
            </p>
          </div>
          <Link href={`/o/${openOrder.shortCode}`} className={buttonClasses("primary", "md")}>
            Join order
          </Link>
        </div>
      ) : null}

      <div className="mt-10">
        <ReadOnlyMenu menu={restaurant.menu} />
      </div>

      {openOrder ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] sm:hidden">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <Link href={`/o/${openOrder.shortCode}`} className={buttonClasses("primary", "lg", "w-full")}>
              Join order
            </Link>
          </div>
        </div>
      ) : null}
    </main>
  );
}
