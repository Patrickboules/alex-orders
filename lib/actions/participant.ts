"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clearParticipantCookie, getCurrentParticipant, setParticipantCookie } from "@/lib/auth";
import {
  getGroupOrder,
  getGroupOrderByShortCode,
} from "@/lib/data/groupOrders";
import { addLine, getLine, removeLine, updateLine } from "@/lib/data/orderLines";
import { upsertParticipantByPhone } from "@/lib/data/participants";
import { getRestaurant } from "@/lib/data/restaurants";
import { joinInputSchema, objectIdStringSchema, orderLineInputSchema } from "@/lib/db/schemas";
import { normalizeEgyptPhone } from "@/lib/phone";
import type { GroupOrderDoc, ParticipantDoc } from "@/lib/types";
import { rateLimit } from "./rateLimit";
import { ORDER_CLOSED, firstZodError, serializeLine, type ActionResult, type SerializedLine } from "./types";

const NOT_JOINED = "Please enter your name and phone first";
const TOO_MANY = "Too many requests. Please wait a minute and try again.";
const INVALID_PHONE = "Enter a valid Egyptian mobile number, e.g. 01012345678";



function revalidateOrderPages(order: GroupOrderDoc) {
  revalidatePath(`/o/${order.shortCode}`);
  revalidatePath(`/admin/orders/${order._id.toString()}`);
  revalidatePath("/admin");
}

/**
 * Name + phone -> participant (reused by phone, name updated) and a 1-year
 * participant_token cookie. Accepts an object or FormData (fields: name, phone).
 */
export async function joinAction(
  input: { name: string; phone: string } | FormData,
): Promise<ActionResult<{ participantId: string; name: string; phone: string }>> {
  try {
    if (!(await rateLimit("join"))) return { ok: false, error: TOO_MANY };
    const raw =
      input instanceof FormData
        ? { name: input.get("name") ?? "", phone: input.get("phone") ?? "" }
        : input;
    const parsed = joinInputSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
    const phone = normalizeEgyptPhone(parsed.data.phone);
    if (!phone) return { ok: false, error: INVALID_PHONE };

    const person = await upsertParticipantByPhone({ name: parsed.data.name, phone });
    await setParticipantCookie(person.token);
    revalidatePath("/o/[shortCode]", "page");
    return {
      ok: true,
      data: { participantId: person._id.toString(), name: person.name, phone: person.phone },
    };
  } catch (err) {
    console.error("joinAction failed", err);
    return { ok: false, error: "Could not join. Please try again." };
  }
}

/** "Not you? Switch": clears the participant cookie. */
export async function switchParticipantAction(): Promise<ActionResult> {
  try {
    await clearParticipantCookie();
    revalidatePath("/o/[shortCode]", "page");
    return { ok: true };
  } catch (err) {
    console.error("switchParticipantAction failed", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Adds a line. Name and price always come from the restaurant's PUBLISHED menu. */
export async function addLineAction(input: {
  shortCode: string;
  itemId: string;
  variantId?: string;
  quantity: number;
  note?: string;
}): Promise<ActionResult<{ line: SerializedLine }>> {
  try {
    const person = await getCurrentParticipant();
    if (!person) return { ok: false, error: NOT_JOINED };
    if (!(await rateLimit("add-line", 60))) return { ok: false, error: TOO_MANY };

    const parsed = orderLineInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
    const { shortCode, itemId, variantId, quantity, note } = parsed.data;

    const order = await getGroupOrderByShortCode(shortCode);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status !== "open") return { ok: false, error: ORDER_CLOSED };

    const restaurant = await getRestaurant(order.restaurantId.toString());
    if (!restaurant || restaurant.menuStatus !== "published") {
      return { ok: false, error: "This menu is not available" };
    }

    let found: { categoryId: string; item: (typeof restaurant.menu.categories)[number]["items"][number] } | null =
      null;
    for (const cat of restaurant.menu.categories) {
      const item = cat.items.find((i) => i.id === itemId);
      if (item) {
        found = { categoryId: cat.id, item };
        break;
      }
    }
    if (!found) return { ok: false, error: "This item is no longer on the menu" };

    const { item } = found;
    const variants = item.variants ?? [];
    let name = item.name;
    let price = item.price;
    let chosenVariant: string | undefined;
    if (variants.length > 0) {
      const variant = variants.find((v) => v.id === variantId);
      if (!variant) return { ok: false, error: "Choose an option for this item" };
      name = `${item.name} – ${variant.name}`;
      price = variant.price;
      chosenVariant = variant.id;
    }
    if (!(price > 0)) return { ok: false, error: "This item has no price yet" };

    const line = await addLine({
      groupOrderId: order._id,
      participantId: person._id,
      itemId: item.id,
      ...(chosenVariant ? { variantId: chosenVariant } : {}),
      nameSnapshot: name,
      categoryIdSnapshot: found.categoryId,
      priceSnapshot: price,
      quantity,
      ...(note ? { note } : {}),
    });
    revalidateOrderPages(order);
    return { ok: true, data: { line: serializeLine(line) } };
  } catch (err) {
    console.error("addLineAction failed", err);
    return { ok: false, error: "Could not add the item. Please try again." };
  }
}

/** Finds the order a participant's own line belongs to. */
async function findOrderOfLine(
  lineId: string,
  person: ParticipantDoc,
): Promise<{ order: GroupOrderDoc | null; closed: boolean }> {
  const line = await getLine(lineId);
  if (!line || !line.participantId.equals(person._id)) return { order: null, closed: false };
  const order = await getGroupOrder(line.groupOrderId.toString());
  return { order, closed: order?.status === "closed" };
}

const updateLineSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be 1–20").max(20, "Quantity must be 1–20").optional(),
  note: z.string().trim().max(140, "Note must be 140 characters or fewer").optional(),
});

/** Change quantity and/or note ("" removes the note) of the participant's own line. */
export async function updateLineAction(
  lineId: string,
  input: { quantity?: number; note?: string },
): Promise<ActionResult> {
  try {
    const person = await getCurrentParticipant();
    if (!person) return { ok: false, error: NOT_JOINED };
    if (!objectIdStringSchema.safeParse(lineId).success) return { ok: false, error: "Item not found" };
    const parsed = updateLineSchema.safeParse(input ?? {});
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

    const { order, closed } = await findOrderOfLine(lineId, person);
    if (closed) return { ok: false, error: ORDER_CLOSED };
    if (!order) return { ok: false, error: "Item not found" };

    const ok = await updateLine(lineId, person._id.toString(), parsed.data);
    if (!ok) return { ok: false, error: "Item not found" };
    revalidateOrderPages(order);
    return { ok: true };
  } catch (err) {
    console.error("updateLineAction failed", err);
    return { ok: false, error: "Could not update the item. Please try again." };
  }
}

/** Removes the participant's own line. */
export async function removeLineAction(lineId: string): Promise<ActionResult> {
  try {
    const person = await getCurrentParticipant();
    if (!person) return { ok: false, error: NOT_JOINED };
    if (!objectIdStringSchema.safeParse(lineId).success) return { ok: false, error: "Item not found" };

    const { order, closed } = await findOrderOfLine(lineId, person);
    if (closed) return { ok: false, error: ORDER_CLOSED };
    if (!order) return { ok: false, error: "Item not found" };

    const ok = await removeLine(lineId, person._id.toString());
    if (!ok) return { ok: false, error: "Item not found" };
    revalidateOrderPages(order);
    return { ok: true };
  } catch (err) {
    console.error("removeLineAction failed", err);
    return { ok: false, error: "Could not remove the item. Please try again." };
  }
}
