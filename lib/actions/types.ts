// Shared result type for every Server Action. No "use server" here (types/helpers only).

import type { OrderLineDoc } from "@/lib/types";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export const ORDER_CLOSED = "This order is closed";
export const NOT_AUTHORIZED = "Please log in again";

/**
 * Lets an action be called either as action(formData) or through
 * useActionState as action(prevState, formData).
 */
export function pickFormData(a: unknown, b?: unknown): FormData | null {
  if (a instanceof FormData) return a;
  if (b instanceof FormData) return b;
  return null;
}

export function firstZodError(err: { issues: { message: string }[] }): string {
  return err.issues[0]?.message ?? "Invalid input";
}

/** An order line as sent to the browser. */
export type SerializedLine = {
  id: string;
  itemId: string;
  variantId?: string;
  name: string;
  unitPrice: number; // piasters
  quantity: number;
  lineTotal: number; // piasters
  note?: string;
};

export function serializeLine(l: OrderLineDoc): SerializedLine {
  const out: SerializedLine = {
    id: l._id.toString(),
    itemId: l.itemId,
    name: l.nameSnapshot,
    unitPrice: l.priceSnapshot,
    quantity: l.quantity,
    lineTotal: l.priceSnapshot * l.quantity,
  };
  if (l.variantId) out.variantId = l.variantId;
  if (l.note) out.note = l.note;
  return out;
}
