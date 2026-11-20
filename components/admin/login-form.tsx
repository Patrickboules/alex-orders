"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { loginAdmin } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/types";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(loginAdmin, null);

  return (
    <form onSubmit={(e) => {
        // Not using the form `action` prop: React resets the fields after it, losing input on errors.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field id="login-phone" label="Phone number">
        <Input id="login-phone" name="phone" type="tel" inputMode="tel" autoComplete="username" required dir="ltr" />
      </Field>
      <Field id="login-password" label="Password">
        <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError>{state && !state.ok ? state.error : null}</FormError>
      <Button type="submit" size="lg" className="w-full" pending={pending}>
        Log in
      </Button>
    </form>
  );
}
