"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/tabs";
import { closeGroupOrderAction, reopenGroupOrderAction, updateGroupOrderAction } from "@/lib/actions/groupOrders";
import type { Multiplier } from "@/lib/types";

export function OrderControls({
  orderId,
  status,
  multiplier,
  participantCount,
  paidCount,
}: {
  orderId: string;
  status: "open" | "closed";
  multiplier: Multiplier;
  participantCount: number;
  paidCount: number;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multError, setMultError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [multPending, startMult] = useTransition();
  const open = status === "open";

  function toggleStatus() {
    setError(null);
    start(async () => {
      const res = open ? await closeGroupOrderAction(orderId) : await reopenGroupOrderAction(orderId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirm(false);
      router.refresh();
    });
  }

  function changeMultiplier(value: "1.14" | "1.26") {
    setMultError(null);
    startMult(async () => {
      const res = await updateGroupOrderAction(orderId, { multiplier: Number(value) as Multiplier });
      if (!res.ok) setMultError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div>
        <p className="mb-1.5 text-xs text-ink-2">Tax &amp; service</p>
        <div className={multPending ? "opacity-60" : undefined} aria-busy={multPending || undefined}>
          <Segmented
            label="Tax and service multiplier"
            value={multiplier.toFixed(2) as "1.14" | "1.26"}
            onChange={changeMultiplier}
            options={[
              { value: "1.14", label: "×1.14" },
              { value: "1.26", label: "×1.26" },
            ]}
          />
        </div>
        {multError ? <p className="mt-1 text-sm text-danger">{multError}</p> : null}
      </div>
      <Button variant={open ? "primary" : "secondary"} onClick={() => setConfirm(true)}>
        {open ? "Close order" : "Reopen order"}
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => {
          setConfirm(false);
          setError(null);
        }}
        title={open ? "Close this order?" : "Reopen this order?"}
        confirmLabel={open ? "Close order" : "Reopen order"}
        onConfirm={toggleStatus}
        pending={pending}
        error={error}
      >
        {open
          ? `${participantCount} ${participantCount === 1 ? "person has" : "people have"} ordered. Once closed, nobody can add or change items, and everyone sees their final receipt.`
          : paidCount > 0
            ? `People can add and change items again. ${paidCount} already paid; if their totals change, their rows will be flagged.`
            : "People can add and change items again until you close it."}
      </ConfirmDialog>
    </div>
  );
}
