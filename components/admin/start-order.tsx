"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/tabs";
import { createGroupOrderAction } from "@/lib/actions/groupOrders";
import type { Multiplier } from "@/lib/types";

export function StartOrder({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [multiplier, setMultiplier] = useState<"1.14" | "1.26">("1.14");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await createGroupOrderAction({
            restaurantId,
            title: title.trim() || undefined,
            multiplier: Number(multiplier) as Multiplier,
          });
          if (!res.ok) setError(res.error);
          else if (res.data) router.push(`/admin/orders/${res.data.id}`);
        });
      }}
    >
      <Field id="order-title" label="Title" hint="Optional">
        <Input
          id="order-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`${restaurantName} – ${today}`}
          maxLength={120}
          dir="auto"
        />
      </Field>
      <div>
        <p id="mult-label" className="mb-1.5 text-sm font-medium">
          Tax &amp; service multiplier
        </p>
        <Segmented
          label="Tax and service multiplier"
          value={multiplier}
          onChange={setMultiplier}
          options={[
            { value: "1.14", label: "×1.14" },
            { value: "1.26", label: "×1.26" },
          ]}
        />
        <p className="mt-1.5 text-sm text-ink-2">Applied to each person’s subtotal. You can change it later.</p>
      </div>
      <FormError>{error}</FormError>
      <Button type="submit" pending={pending}>
        Start group order
      </Button>
    </form>
  );
}
