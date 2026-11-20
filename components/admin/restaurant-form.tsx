"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useState } from "react";
import { RestaurantCover } from "@/components/restaurant-card";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { createRestaurantAction, updateRestaurantAction } from "@/lib/actions/restaurants";
import type { ActionResult } from "@/lib/actions/types";

type Initial = { id: string; name: string; phone?: string; coverImageUrl?: string };

export function RestaurantForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const editing = Boolean(initial);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [saved, setSaved] = useState(false);

  const [state, action, pending] = useActionState<ActionResult<{ id: string }> | ActionResult | null, FormData>(
    async (prev, formData) => {
      setSaved(false);
      if (initial) {
        const res = await updateRestaurantAction(initial.id, prev, formData);
        if (res.ok) {
          setSaved(true);
          setPreview(null);
          router.refresh();
        }
        return res;
      }
      const res = await createRestaurantAction(prev, formData);
      if (res.ok && res.data) router.push(`/admin/restaurants/${res.data.id}`);
      return res;
    },
    null,
  );

  const coverUrl = removeCover ? null : (preview ?? initial?.coverImageUrl ?? null);

  return (
    <form onSubmit={(e) => {
        // Not using the form `action` prop: React resets the fields after it, losing input on errors.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }} className="space-y-5">
      <Field id="r-name" label="Name">
        <Input id="r-name" name="name" required maxLength={80} defaultValue={initial?.name} dir="auto" />
      </Field>
      <Field id="r-phone" label="Phone" hint="Optional" help="The restaurant’s number, for placing the order.">
        <Input
          id="r-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={initial?.phone}
          dir="ltr"
          aria-describedby="r-phone-help"
        />
      </Field>

      {editing ? (
        <div>
          <p className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
            <span>Cover image</span>
            <span className="text-xs font-normal text-ink-3">Optional, up to 5 MB</span>
          </p>
          <div className="flex items-center gap-4">
            <RestaurantCover
              name={initial?.name || "?"}
              url={coverUrl}
              className="aspect-[16/10] w-36 shrink-0 rounded-[var(--radius-control)] border border-line [&_span]:text-3xl"
            />
            <div className="flex flex-col items-start gap-1">
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-[var(--radius-control)] border border-line-strong px-4 text-sm font-medium hover:bg-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
                {coverUrl ? "Replace image" : "Choose image"}
                <input
                  type="file"
                  name="cover"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(f ? URL.createObjectURL(f) : null);
                    if (f) setRemoveCover(false);
                  }}
                />
              </label>
              {editing && initial?.coverImageUrl && !preview ? (
                <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    name="removeCover"
                    value="1"
                    checked={removeCover}
                    onChange={(e) => setRemoveCover(e.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                  Remove image
                </label>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <FormError>{state && !state.ok ? state.error : null}</FormError>
      <div className="flex items-center gap-3">
        <Button type="submit" pending={pending}>
          {editing ? "Save details" : "Create restaurant"}
        </Button>
        {saved ? (
          <span role="status" className="text-sm text-accent">
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
