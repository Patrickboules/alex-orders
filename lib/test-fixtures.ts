// Test-only builders shared by receipts.test.ts and regroup.test.ts.
import { ObjectId } from "mongodb";
import type { GroupOrderDoc, Multiplier, OrderLineDoc, ParticipantDoc } from "@/lib/types";

let clock = Date.UTC(2026, 0, 1);

export function person(name: string, phone = "01000000000"): ParticipantDoc {
  return { _id: new ObjectId(), name, phone, token: name, createdAt: new Date() };
}

export function order(multiplier: Multiplier, payments: GroupOrderDoc["payments"] = []): GroupOrderDoc {
  return {
    _id: new ObjectId(),
    shortCode: "abcd1234",
    restaurantId: new ObjectId(),
    title: "Test",
    status: "open",
    multiplier,
    createdBy: new ObjectId(),
    createdAt: new Date(),
    payments,
  };
}

export function line(
  who: ParticipantDoc,
  o: GroupOrderDoc,
  opts: {
    itemId?: string;
    variantId?: string;
    name?: string;
    category?: string;
    price: number;
    quantity?: number;
    note?: string;
  },
): OrderLineDoc {
  clock += 1000;
  const l: OrderLineDoc = {
    _id: new ObjectId(),
    groupOrderId: o._id,
    participantId: who._id,
    itemId: opts.itemId ?? "item",
    nameSnapshot: opts.name ?? "Item",
    categoryIdSnapshot: opts.category ?? "cat",
    priceSnapshot: opts.price,
    quantity: opts.quantity ?? 1,
    createdAt: new Date(clock),
    updatedAt: new Date(clock),
  };
  if (opts.variantId) l.variantId = opts.variantId;
  if (opts.note) l.note = opts.note;
  return l;
}
