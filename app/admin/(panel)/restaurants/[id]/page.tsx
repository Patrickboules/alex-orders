import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { DeleteRestaurant } from "@/components/admin/delete-restaurant";
import { MenuWorkspace } from "@/components/admin/menu-workspace";
import { RestaurantForm } from "@/components/admin/restaurant-form";
import { StartOrder } from "@/components/admin/start-order";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getAdminRestaurant } from "@/lib/actions/queries";

const load = cache(getAdminRestaurant);

/** Short content hash: the editor resets only when the stored menu itself changes. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function generateMetadata({ params }: PageProps<"/admin/restaurants/[id]">): Promise<Metadata> {
  const r = await load((await params).id);
  return { title: r?.name ?? "Restaurant" };
}

export default function AdminRestaurantPage({ params }: PageProps<"/admin/restaurants/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton wide />}>
      <RestaurantAdmin params={params} />
    </Suspense>
  );
}

async function RestaurantAdmin({ params }: { params: PageProps<"/admin/restaurants/[id]">["params"] }) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();

  const editorMenu = r.draftMenu ?? (r.menu.categories.length > 0 ? r.menu : null);
  const published = r.menuStatus === "published";

  return (
    <main className="mx-auto max-w-6xl px-4 pt-6 pb-20">
      <Link href="/admin/restaurants" className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-ink-2 hover:text-ink">
        Restaurants
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" dir="auto">
            {r.name}
          </h1>
          {published ? (
            <Badge tone="open">Published</Badge>
          ) : r.menuStatus === "draft" ? (
            <Badge tone="warn">Draft</Badge>
          ) : (
            <Badge>No menu</Badge>
          )}
        </div>
        {published ? (
          <Link href={`/r/${r.id}`} className={buttonClasses("ghost", "md")}>
            View public page
          </Link>
        ) : null}
      </div>

      {r.openOrder ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-box)] border border-accent/30 bg-accent-wash p-4">
          <p className="font-medium text-accent">A group order is open for this restaurant.</p>
          <Link href={`/admin/orders/${r.openOrder.id}`} className={buttonClasses("primary")}>
            Manage order
          </Link>
        </div>
      ) : published ? (
        <section aria-labelledby="start-order" className="mt-6 rounded-[var(--radius-box)] border border-line p-5 sm:p-6">
          <h2 id="start-order" className="text-lg font-semibold">
            Start a group order
          </h2>
          <p className="mt-1 mb-5 text-sm text-ink-2">You’ll get a link to share with everyone ordering.</p>
          <StartOrder restaurantId={r.id} restaurantName={r.name} />
        </section>
      ) : null}

      <section aria-labelledby="menu-h" className="mt-10">
        <h2 id="menu-h" className="text-lg font-semibold">
          Menu
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-2">
          {editorMenu
            ? "Check names and prices against the original, then publish."
            : "Upload photos, a PDF or a link. The items and prices are read for you to review."}
        </p>
        <MenuWorkspace
          restaurantId={r.id}
          menu={editorMenu}
          menuStatus={r.menuStatus}
          sourceFiles={r.sourceFiles}
          version={hash(JSON.stringify([editorMenu, r.sourceFiles]))}
        />
      </section>

      <section aria-labelledby="details-h" className="mt-14 grid gap-10 border-t border-line pt-10 md:grid-cols-2">
        <div>
          <h2 id="details-h" className="mb-5 text-lg font-semibold">
            Details
          </h2>
          <RestaurantForm
            initial={{ id: r.id, name: r.name, phone: r.phone, coverImageUrl: r.coverImageUrl }}
          />
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Delete</h2>
          <p className="mb-4 text-sm text-ink-2">Removes the restaurant and its menu from the site.</p>
          <DeleteRestaurant id={r.id} name={r.name} blocked={Boolean(r.openOrder)} />
        </div>
      </section>
    </main>
  );
}
