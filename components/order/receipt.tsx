import Image from "next/image";
import { CopyButton } from "@/components/ui/copy-button";
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
}: {
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
          <div className="flex justify-between gap-4">
            <dt className="text-ink-2">Tax &amp; service (×{receipt.multiplier.toFixed(2)})</dt>
            <dd className="num">{formatEGP(taxAmount)}</dd>
          </div>
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

      {!receipt.paid ? <PaymentOptions total={total} payment={payment} /> : null}
    </section>
  );
}

function PaymentOptions({ total, payment }: { total: string; payment: PaymentInfo }) {
  return (
    <div>
      <h3 className="font-semibold">How to pay</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-box)] border border-line p-4">
          <p className="text-sm font-semibold">Cash</p>
          <p className="mt-1.5">
            Pay <span className="num font-semibold">{total}</span> in cash to{" "}
            <span dir="auto" className="font-medium">
              {payment.adminName}
            </span>
            .
          </p>
        </div>

        <div className="rounded-[var(--radius-box)] border border-line p-4">
          <p className="text-sm font-semibold">InstaPay</p>
          {payment.instapayQrUrl ? (
            <div className="relative mt-3 size-40 overflow-hidden rounded-[var(--radius-control)] border border-line bg-paper">
              <Image src={payment.instapayQrUrl} alt="InstaPay QR code" fill unoptimized sizes="160px" className="object-contain p-1.5" />
            </div>
          ) : null}
          <p className="mt-3 text-sm text-ink-2">Send exactly</p>
          <p className="num text-lg font-semibold">{total}</p>
          {payment.instapayHandle ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-wash py-1 ps-3 pe-1">
              <span className="truncate font-medium" dir="ltr">
                {payment.instapayHandle}
              </span>
              <CopyButton text={payment.instapayHandle} label="Copy" aria-label="Copy InstaPay handle" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
