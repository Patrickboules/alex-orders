"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import type { PaymentInfo, PaymentMethod } from "@/components/view-types";
import { choosePaymentMethodAction } from "@/lib/actions/participant";
import { cn } from "@/components/ui/cn";

/**
 * "How will you pay?" — the participant picks cash or InstaPay (saved so the admin
 * sees it), then sees the details for that method.
 */
export function PaymentChoice({
  shortCode,
  total,
  payment,
  initialChoice,
}: {
  shortCode: string;
  total: string;
  payment: PaymentInfo;
  initialChoice?: PaymentMethod;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<PaymentMethod | undefined>(initialChoice);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(method: PaymentMethod) {
    if (method === choice) return;
    const previous = choice;
    setChoice(method);
    setError(null);
    start(async () => {
      const res = await choosePaymentMethodAction({ shortCode, method });
      if (!res.ok) {
        setChoice(previous);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const options: { value: PaymentMethod; label: string; hint: string }[] = [
    { value: "cash", label: "Cash", hint: `To ${payment.adminName}` },
    { value: "instapay", label: "InstaPay", hint: "Transfer from your phone" },
  ];

  return (
    <div>
      <h3 id="pay-choice" className="font-semibold">
        How will you pay?
      </h3>
      {!choice ? <p className="mt-1 text-sm text-ink-2">Pick one so the organiser knows.</p> : null}

      <div role="radiogroup" aria-labelledby="pay-choice" className="mt-3 grid grid-cols-2 gap-3" aria-busy={pending || undefined}>
        {options.map((o) => {
          const selected = choice === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(o.value)}
              className={cn(
                "flex min-h-16 flex-col items-start justify-center rounded-[var(--radius-box)] border px-4 py-3 text-start transition-colors duration-150",
                selected ? "border-ink bg-ink text-paper" : "border-line-strong hover:border-ink",
              )}
            >
              <span className="font-semibold">
                {o.label}
                {selected ? " ✓" : null}
              </span>
              <span className={cn("text-xs", selected ? "text-paper/80" : "text-ink-2")} dir="auto">
                {o.hint}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      {choice === "cash" ? (
        <div className="mt-4 rounded-[var(--radius-box)] border border-line p-4">
          <p>
            Pay <span className="num font-semibold">{total}</span> in cash to{" "}
            <span dir="auto" className="font-medium">
              {payment.adminName}
            </span>
            .
          </p>
        </div>
      ) : null}

      {choice === "instapay" ? (
        <div className="mt-4 rounded-[var(--radius-box)] border border-line p-4">
          <p className="text-sm text-ink-2">Send exactly</p>
          <p className="num text-lg font-semibold">{total}</p>
          {payment.instapayHandle ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[var(--radius-control)] bg-wash py-1 ps-3 pe-1">
              <span className="truncate font-medium" dir="ltr">
                {payment.instapayHandle}
              </span>
              <CopyButton text={payment.instapayHandle} label="Copy" aria-label="Copy InstaPay handle" />
            </div>
          ) : null}
          {payment.instapayQrUrl ? (
            <div className="relative mt-3 aspect-[729/950] w-56 max-w-full overflow-hidden rounded-[var(--radius-control)] border border-line bg-paper">
              <Image src={payment.instapayQrUrl} alt="InstaPay QR code" fill unoptimized sizes="224px" className="object-contain p-1.5" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
