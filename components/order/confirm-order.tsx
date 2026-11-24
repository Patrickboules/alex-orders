"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmOrderAction } from "@/lib/actions/participant";

/** "Confirm my order" so the organiser knows this person is done choosing. */
export function ConfirmOrder({ shortCode, confirmed }: { shortCode: string; confirmed: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set(value: boolean) {
    setError(null);
    start(async () => {
      const res = await confirmOrderAction({ shortCode, confirmed: value });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div>
      {confirmed ? (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-box)] border border-accent bg-accent/5 px-4 py-3">
          <div>
            <p className="font-semibold text-accent">Order confirmed ✓</p>
            <p className="text-xs text-ink-2">Changing your items will undo this.</p>
          </div>
          <Button variant="secondary" size="sm" pending={pending} onClick={() => set(false)}>
            Undo
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" pending={pending} onClick={() => set(true)}>
          Confirm my order
        </Button>
      )}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
