"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/auth";
import {
  createGroupOrder,
  getGroupOrder,
  getOpenOrderForRestaurant,
  removeParticipantRecords,
  setGroupOrderStatus,
  setPayment,
  updateGroupOrder,
} from "@/lib/data/groupOrders";
import {
  getLine,
  listLinesForOrder,
  listLinesInvolving,
  removeLineInOrder,
  removeParticipantLines,
  setLineSharedWith,
} from "@/lib/data/orderLines";
import { getParticipantsByIds } from "@/lib/data/participants";
import { getRestaurant } from "@/lib/data/restaurants";
import { groupOrderInputSchema, multiplierSchema, objectIdStringSchema } from "@/lib/db/schemas";
import { calculateReceipt } from "@/lib/receipts";
import type { GroupOrderDoc, Multiplier, PaymentMethod } from "@/lib/types";
import { NOT_AUTHORIZED, firstZodError, type ActionResult } from "./types";

const ALREADY_OPEN = "This restaurant already has an open group order";

function revalidateOrder(order: Pick<GroupOrderDoc, "_id" | "shortCode" | "restaurantId">) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/admin/orders/${order._id.toString()}`);
  revalidatePath(`/o/${order.shortCode}`);
  revalidatePath(`/r/${order.restaurantId.toString()}`);
}

function defaultTitle(restaurantName: string): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }).format(new Date());
  return `${restaurantName} – ${date}`;
}

async function loadOrder(id: string): Promise<GroupOrderDoc | null> {
  if (!objectIdStringSchema.safeParse(id).success) return null;
  return getGroupOrder(id);
}

/** Starts an open group order. Returns { id, shortCode }; share link is /o/{shortCode}. */
export async function createGroupOrderAction(input: {
  restaurantId: string;
  title?: string;
  multiplier: Multiplier;
}): Promise<ActionResult<{ id: string; shortCode: string }>> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const parsed = groupOrderInputSchema.safeParse({
      ...input,
      multiplier: typeof input?.multiplier === "string" ? Number(input.multiplier) : input?.multiplier,
    });
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

    const restaurant = await getRestaurant(parsed.data.restaurantId);
    if (!restaurant) return { ok: false, error: "Restaurant not found" };
    if (restaurant.menuStatus !== "published") {
      return { ok: false, error: "Publish the menu before starting a group order" };
    }
    if (await getOpenOrderForRestaurant(parsed.data.restaurantId)) {
      return { ok: false, error: ALREADY_OPEN };
    }

    const order = await createGroupOrder({
      restaurantId: restaurant._id,
      title: parsed.data.title || defaultTitle(restaurant.name),
      multiplier: parsed.data.multiplier,
      createdBy: admin._id,
    });
    revalidateOrder(order);
    return { ok: true, data: { id: order._id.toString(), shortCode: order.shortCode } };
  } catch (err) {
    console.error("createGroupOrderAction failed", err);
    return { ok: false, error: "Could not start the group order. Please try again." };
  }
}

const updateSchema = z.object({
  title: z.string().trim().min(1, "Title can't be empty").max(120).optional(),
  multiplier: multiplierSchema.optional(),
});

/** Change title and/or multiplier, while open or after closing. Receipts recalculate on read. */
export async function updateGroupOrderAction(
  id: string,
  input: { title?: string; multiplier?: Multiplier },
): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const parsed = updateSchema.safeParse({
      ...input,
      multiplier: typeof input?.multiplier === "string" ? Number(input.multiplier) : input?.multiplier,
    });
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
    const order = await loadOrder(id);
    if (!order) return { ok: false, error: "Order not found" };
    await updateGroupOrder(id, parsed.data);
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("updateGroupOrderAction failed", err);
    return { ok: false, error: "Could not update the order. Please try again." };
  }
}

export async function closeGroupOrderAction(id: string): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const order = await loadOrder(id);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status === "closed") return { ok: true };
    await setGroupOrderStatus(id, "closed");
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("closeGroupOrderAction failed", err);
    return { ok: false, error: "Could not close the order. Please try again." };
  }
}

/** Blocked if the restaurant already has another open order. */
export async function reopenGroupOrderAction(id: string): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const order = await loadOrder(id);
    if (!order) return { ok: false, error: "Order not found" };
    if (order.status === "open") return { ok: true };
    const other = await getOpenOrderForRestaurant(order.restaurantId.toString());
    if (other && other._id.toString() !== id) return { ok: false, error: ALREADY_OPEN };
    await setGroupOrderStatus(id, "open");
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("reopenGroupOrderAction failed", err);
    return { ok: false, error: "Could not reopen the order. Please try again." };
  }
}

const methodSchema = z.enum(["cash", "instapay"]).nullable();

/**
 * Marks a participant paid (method) or unpaid (null). Stores the participant's current
 * total as amountAtPayment so a later multiplier change shows "Amount changed since payment".
 */
export async function setPaymentAction(
  orderId: string,
  participantId: string,
  method: PaymentMethod | null,
): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const m = methodSchema.safeParse(method);
    if (!m.success) return { ok: false, error: "Choose Cash or InstaPay" };
    if (!objectIdStringSchema.safeParse(participantId).success) {
      return { ok: false, error: "Participant not found" };
    }
    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };

    if (m.data === null) {
      await setPayment(orderId, participantId, null);
    } else {
      const [person] = await getParticipantsByIds([participantId]);
      if (!person) return { ok: false, error: "Participant not found" };
      const lines = await listLinesInvolving(orderId, participantId);
      const receipt = calculateReceipt(order, lines, person);
      await setPayment(orderId, participantId, {
        paidMethod: m.data,
        amountAtPayment: receipt.total,
      });
    }
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("setPaymentAction failed", err);
    return { ok: false, error: "Could not save the payment. Please try again." };
  }
}

/** Admin: removes one item from someone's order. */
export async function removeLineAdminAction(orderId: string, lineId: string): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    if (!objectIdStringSchema.safeParse(lineId).success || !(await removeLineInOrder(orderId, lineId))) {
      return { ok: false, error: "Item not found" };
    }
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("removeLineAdminAction failed", err);
    return { ok: false, error: "Could not remove the item. Please try again." };
  }
}

/** Admin: removes a person and all their items from the order (and from items shared with them). */
export async function removeParticipantAdminAction(orderId: string, participantId: string): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    if (!objectIdStringSchema.safeParse(participantId).success) return { ok: false, error: "Participant not found" };
    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    await removeParticipantLines(orderId, participantId);
    await removeParticipantRecords(orderId, participantId);
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("removeParticipantAdminAction failed", err);
    return { ok: false, error: "Could not remove this person. Please try again." };
  }
}

const shareSchema = z.array(objectIdStringSchema).max(50);

/**
 * Admin: splits an item's cost equally between its owner and the chosen people
 * (who must already be in the order). An empty list stops sharing.
 */
export async function setLineSharingAction(orderId: string, lineId: string, participantIds: string[]): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    const ids = shareSchema.safeParse(participantIds);
    if (!ids.success || !objectIdStringSchema.safeParse(lineId).success) return { ok: false, error: "Choose who shares it" };
    const order = await loadOrder(orderId);
    if (!order) return { ok: false, error: "Order not found" };
    const line = await getLine(lineId);
    if (!line || !line.groupOrderId.equals(order._id)) return { ok: false, error: "Item not found" };

    const inOrder = new Set(
      (await listLinesForOrder(orderId)).flatMap((l) => [l.participantId.toString(), ...(l.sharedWith ?? []).map(String)]),
    );
    const owner = line.participantId.toString();
    const sharers = [...new Set(ids.data)].filter((id) => id !== owner);
    if (sharers.some((id) => !inOrder.has(id))) return { ok: false, error: "Only people in this order can share an item" };

    await setLineSharedWith(orderId, lineId, sharers);
    revalidateOrder(order);
    return { ok: true };
  } catch (err) {
    console.error("setLineSharingAction failed", err);
    return { ok: false, error: "Could not split the item. Please try again." };
  }
}
