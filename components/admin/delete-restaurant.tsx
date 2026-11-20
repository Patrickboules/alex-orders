"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { deleteRestaurantAction } from "@/lib/actions/restaurants";

export function DeleteRestaurant({ id, name, blocked }: { id: string; name: string; blocked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} disabled={blocked}>
        Delete restaurant
      </Button>
      {blocked ? <p className="mt-2 text-sm text-ink-2">Close its open group order before deleting.</p> : null}
      <ConfirmDialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={`Delete ${name}?`}
        confirmLabel="Delete restaurant"
        tone="danger"
        pending={pending}
        error={error}
        onConfirm={() =>
          start(async () => {
            const res = await deleteRestaurantAction(id);
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.push("/admin/restaurants");
          })
        }
      >
        Its menu goes with it. Past orders keep their receipts. This can’t be undone.
      </ConfirmDialog>
    </>
  );
}
