import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cache, Suspense } from "react";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { OrderControls } from "@/components/admin/order-controls";
import { OrderTabs } from "@/components/admin/order-tabs";
import { ShareLink } from "@/components/admin/share-link";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import { getAdminOrderData } from "@/lib/actions/queries";
import { formatEGP } from "@/lib/money";

const load = cache(getAdminOrderData);

export async function generateMetadata({ params }: PageProps<"/admin/orders/[id]">): Promise<Metadata> {
  const data = await load((await params).id);
  return { title: data ? data.order.title : "Order" };
}

export default function AdminOrderPage({ params }: PageProps<"/admin/orders/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton wide />}>
      <OrderAdmin params={params} />
    </Suspense>
  );
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function qrSvg(url: string): Promise<string | null> {
  try {
    return await QRCode.toString(url, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#16181a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

async function OrderAdmin({ params }: { params: PageProps<"/admin/orders/[id]">["params"] }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();

  const { order, restaurant, receipts, regrouped, regroupedText, paidCount, participantCount, collected, outstanding, grandTotal } = data;
  const open = order.status === "open";
  const shareUrl = `${await siteOrigin()}${data.sharePath}`;
  const qr = await qrSvg(shareUrl);
  const itemCount = receipts.reduce((n, r) => n + r.lines.reduce((m, l) => m + l.quantity, 0), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-20">
      <Link href="/admin" className="-mx-1 inline-flex min-h-11 items-center px-1 text-sm text-ink-2 hover:text-ink">
        Dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight" dir="auto">
              {restaurant.name}
            </h1>
            {open ? (
              <Badge tone="open" dot>
                Open
              </Badge>
            ) : (
              <Badge>Closed</Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-2" dir="auto">
            {order.title}
          </p>
          <div className="mt-2">
            <AutoRefresh seconds={10} />
          </div>
        </div>
        <OrderControls
          orderId={order.id}
          status={order.status}
          multiplier={order.multiplier}
          participantCount={participantCount}
          paidCount={paidCount}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ShareLink url={shareUrl} qrSvg={qr} />
        <dl className="grid grid-cols-3 gap-3 rounded-[var(--radius-box)] border border-line p-4">
          <div>
            <dt className="text-sm text-ink-2">People</dt>
            <dd className="num mt-1 text-xl font-semibold">{participantCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Items</dt>
            <dd className="num mt-1 text-xl font-semibold">{itemCount}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">To collect</dt>
            <dd className="num mt-1 text-xl font-semibold">{formatEGP(grandTotal)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-10">
        <OrderTabs
          orderId={order.id}
          receipts={receipts}
          regrouped={regrouped}
          regroupedText={regroupedText}
          paidCount={paidCount}
          collected={collected}
          outstanding={outstanding}
        />
      </div>
    </main>
  );
}
