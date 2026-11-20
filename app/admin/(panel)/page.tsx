import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/skeletons";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { getAdminDashboard, type DashboardOrder } from "@/lib/actions/queries";
import { formatEGP } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton wide />}>
      <Dashboard />
    </Suspense>
  );
}

function shortDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function Dashboard() {
  const { admin, openOrders, recentClosedOrders, restaurantCount } = await getAdminDashboard();

  return (
    <main className="mx-auto max-w-5xl px-4 pt-8 pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hi, {admin.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {openOrders.length === 0
              ? "No group orders are open right now."
              : openOrders.length === 1
                ? "1 group order is open."
                : `${openOrders.length} group orders are open.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/restaurants" className={buttonClasses("secondary")}>
            Restaurants ({restaurantCount})
          </Link>
          <Link href="/admin/restaurants/new" className={buttonClasses("primary")}>
            New restaurant
          </Link>
        </div>
      </div>

      <section aria-labelledby="open-orders" className="mt-10">
        <h2 id="open-orders" className="text-lg font-semibold">
          Open orders
        </h2>
        {openOrders.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing open">
              Start a group order from a restaurant with a published menu.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {openOrders.map((o) => (
              <li key={o.order.id}>
                <OpenOrderCard o={o} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="closed-orders" className="mt-12">
        <h2 id="closed-orders" className="text-lg font-semibold">
          Recently closed
        </h2>
        {recentClosedOrders.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">Closed orders and their payments show up here.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-box)] border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-line bg-wash text-start text-ink-2">
                <tr>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">Order</th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium">Closed</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">Paid</th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentClosedOrders.map((o) => (
                  <tr key={o.order.id} className="hover:bg-wash">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${o.order.id}`} className="font-medium underline-offset-4 hover:underline" dir="auto">
                        {o.restaurantName}
                      </Link>
                      <div className="text-ink-2" dir="auto">{o.order.title}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{shortDate(o.order.closedAt)}</td>
                    <td className="num px-4 py-3 text-end">
                      {o.paidCount} of {o.participantCount}
                    </td>
                    <td className={`num px-4 py-3 text-end ${o.outstanding > 0 ? "font-medium" : "text-ink-2"}`}>
                      {o.outstanding > 0 ? formatEGP(o.outstanding) : "Settled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function OpenOrderCard({ o }: { o: DashboardOrder }) {
  return (
    <Link
      href={`/admin/orders/${o.order.id}`}
      className="block rounded-[var(--radius-box)] border border-line p-4 transition-colors duration-150 hover:border-line-strong"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold" dir="auto">
            {o.restaurantName}
          </p>
          <p className="truncate text-sm text-ink-2" dir="auto">
            {o.order.title}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium text-accent">Manage</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-ink-2">People</dt>
          <dd className="num font-medium">{o.participantCount}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Items</dt>
          <dd className="num font-medium">{o.itemCount}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Running total</dt>
          <dd className="num font-medium">{formatEGP(o.runningTotal)}</dd>
        </div>
      </dl>
    </Link>
  );
}
