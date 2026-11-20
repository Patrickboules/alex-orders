"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { joinAction } from "@/lib/actions/participant";

type State = { error: string | null };

export function JoinForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<State, FormData>(async (_prev, formData) => {
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    if (!name) return { error: "Enter your name" };
    if (!phone) return { error: "Enter your phone number" };
    const res = await joinAction({ name, phone });
    if (!res.ok) return { error: res.error };
    router.refresh();
    return { error: null };
  }, { error: null });

  return (
    <form onSubmit={(e) => {
        // Not using the form `action` prop: React resets the fields after it, losing input on errors.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }} className="space-y-4" noValidate>
      <Field id="join-name" label="Your name">
        <Input
          id="join-name"
          name="name"
          autoComplete="name"
          required
          maxLength={60}
          dir="auto"
          placeholder="e.g. Ahmed"
        />
      </Field>
      <Field id="join-phone" label="Phone number" help="Egyptian mobile, e.g. 01012345678. It’s how we find your order again.">
        <Input
          id="join-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          dir="ltr"
          placeholder="01X XXXX XXXX"
          aria-describedby="join-phone-help"
        />
      </Field>
      <FormError>{state.error}</FormError>
      <Button type="submit" size="lg" className="w-full" pending={pending}>
        Start ordering
      </Button>
    </form>
  );
}
