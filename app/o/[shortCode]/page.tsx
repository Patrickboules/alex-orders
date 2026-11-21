import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { JoinForm } from "@/components/order/join-form";
import { OrderMenu } from "@/components/order/order-menu";
import { ReceiptSlip } from "@/components/order/receipt";
import { SwitchParticipant } from "@/components/order/switch-participant";
import { SiteHeader } from "@/components/site-header";
import { PageSkeleton } from "@/components/skeletons";
import { Badge } from "@/components/ui/badge";
import type { PaymentInfo } from "@/components/view-types";
import { getOrderPageData } from "@/lib/actions/queries";

const load = cache(getOrderPageData);

export async function generateMetadata({ params }: PageProps<"/o/[shortCode]">): Promise<Metadata> {
  const data = await load((await params).shortCode);
  return {
    title: data ? `Order from ${data.restaurant.name}` : "Order not found",
    robots: { index: false },
  };
}

export default function OrderPage({ params }: PageProps<"/o/[shortCode]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<PageSkeleton />}>
        <OrderContent params={params} />
      </Suspense>
    </>
  );
}

async function OrderContent({ params }: { params: PageProps<"/o/[shortCode]">["params"] }) {
  const { shortCode } = await params;
  const data = await load(shortCode);
  if (!data) notFound();

  const { order, restaurant, participant, myLines, myReceipt, isEstimate, instapay, cashToName } = data;
  const closed = order.status === "closed";
  const payment: PaymentInfo = {
    adminName: cashToName ?? "the organiser",
    instapayQrUrl: instapay.qrUrl,
    instapayHandle: instapay.handle,
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6">
      <header>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight" dir="auto">
            {restaurant.name}
          </h1>
          {closed ? <Badge>Closed</Badge> : <Badge tone="open" dot>Open</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-ink-2" dir="auto">
          {order.title}
        </p>
        {participant ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
            <span>
              Ordering as{" "}
              <span className="font-medium text-ink" dir="auto">
                {participant.name}
              </span>
              .
            </span>
            <SwitchParticipant />
          </p>
        ) : null}
      </header>

      {closed ? (
        <div role="status" className="mt-6 rounded-[var(--radius-box)] border border-line bg-wash px-4 py-3">
          <p className="font-medium">This order is closed</p>
          <p className="text-sm text-ink-2">Nothing can be added or changed now.</p>
        </div>
      ) : null}

      {!participant ? (
        <section aria-labelledby="join-title" className="mt-8 rounded-[var(--radius-box)] border border-line p-5 sm:p-6">
          <h2 id="join-title" className="text-lg font-semibold">
            {closed ? "Find your receipt" : "Join this order"}
          </h2>
          <p className="mt-1 mb-5 text-sm text-ink-2">
            {closed
              ? "Enter the name and phone number you ordered with."
              : "Your name and phone number, so the organiser knows whose food is whose. No password needed."}
          </p>
          <JoinForm />
        </section>
      ) : closed ? (
        <div className="mt-8 pb-16">
          {myReceipt && myReceipt.lines.length > 0 ? (
            <ReceiptSlip
              receipt={myReceipt}
              restaurantName={restaurant.name}
              date={order.closedAt ?? order.createdAt}
              estimate={false}
              payment={payment}
              shortCode={order.shortCode}
            />
          ) : (
            <p className="text-ink-2">You didn’t add anything to this order, so there’s nothing to pay.</p>
          )}
        </div>
      ) : (
        <div className="mt-6">
          <OrderMenu shortCode={order.shortCode} menu={restaurant.menu} lines={myLines} receipt={myReceipt} payment={payment} />
          {myReceipt && myReceipt.lines.length > 0 ? (
            <div className="-mt-12 border-t border-line pt-8 pb-32">
              <p className="mb-4 text-sm text-ink-2">Your receipt so far</p>
              <ReceiptSlip
                receipt={myReceipt}
                restaurantName={restaurant.name}
                date={order.createdAt}
                estimate={isEstimate}
                payment={payment}
                shortCode={order.shortCode}
              />
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
