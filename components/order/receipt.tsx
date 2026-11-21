import { PaymentChoice } from "@/components/order/payment-choice";
import type { PaymentInfo, Receipt } from "@/components/view-types";
import { formatEGP } from "@/lib/money";

function formatDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A participant's receipt, set like a printed slip. While the order is open it
 * is an estimate; once closed it is final and shows how to pay.
 */
export function ReceiptSlip({
  receipt,
  restaurantName,
  date,
  estimate,
  payment,
  shortCode,
}: {
  shortCode: string;
  receipt: Receipt;
  restaurantName: string;
  date?: string | null;
  estimate: boolean;
  payment: PaymentInfo;
}) {
  const taxAmount = receipt.total - receipt.subtotal;
  const total = formatEGP(receipt.total);
  const when = formatDate(date);

  return (
    <section aria-labelledby="receipt-title" className="space-y-6">
      <div className="slip rounded-t-[var(--radius-box)] px-5 pt-6 sm:px-7">
        <header className="text-center">
          <h2 id="receipt-title" className="text-lg font-semibold" dir="auto">
            {restaurantName}
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            {receipt.participantName}
            {when ? `, ${when}` : null}
          </p>
          {estimate ? (
            <p className="mt-3 inline-block rounded-full border border-line-strong bg-paper px-3 py-0.5 text-xs font-medium text-ink-2">
              Estimate – final after order closes
            </p>
          ) : null}
        </header>

        <ul className="mt-6 space-y-3 border-t border-dashed border-line-strong pt-5">
          {receipt.lines.map((line) => (
            <li key={line.lineId}>
              <div className="flex items-baseline gap-2">
                <span className="num shrink-0 text-ink-2">{line.quantity} ×</span>
                <span className="min-w-0 font-medium" dir="auto">
                  {line.name}
                </span>
                <span aria-hidden="true" className="leader" />
                <span className="num shrink-0">{formatEGP(line.lineTotal)}</span>
              </div>
              {line.note ? (
                <p className="mt-0.5 ps-8 text-sm text-ink-2" dir="auto">
                  {line.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <dl className="mt-5 space-y-1.5 border-t border-dashed border-line-strong pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Subtotal</dt>
            <dd className="num">{formatEGP(receipt.subtotal)}</dd>
          </div>
          {receipt.multiplier !== 1 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Tax &amp; service (×{receipt.multiplier.toFixed(2)})</dt>
              <dd className="num">{formatEGP(taxAmount)}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-ink pt-4">
          <div className="flex items-end justify-between gap-4">
            <p className="pb-1 font-medium">{estimate ? "Estimated total" : "Total to pay"}</p>
            <p className="num text-2xl font-semibold tracking-tight">{total}</p>
          </div>
          <p className="mt-3 flex justify-end">
            {receipt.paid ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
                  <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Paid{receipt.paidMethod ? ` by ${receipt.paidMethod === "cash" ? "cash" : "InstaPay"}` : ""}
              </span>
            ) : (
              <span className="text-sm font-medium text-ink-2">Unpaid</span>
            )}
          </p>
        </div>
      </div>

      {!receipt.paid ? (
        <PaymentChoice shortCode={shortCode} total={total} payment={payment} initialChoice={receipt.paymentChoice} />
      ) : null}
    </section>
  );
}
