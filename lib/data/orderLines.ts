import "server-only";
import { ObjectId } from "mongodb";
import { orderLines } from "@/lib/db/collections";
import type { OrderLineDoc } from "@/lib/types";
import { toObjectId } from "./ids";

export async function getLine(lineId: string): Promise<OrderLineDoc | null> {
  const id = toObjectId(lineId);
  if (!id) return null;
  const col = await orderLines();
  return col.findOne({ _id: id });
}

export async function listLinesForOrder(groupOrderId: string): Promise<OrderLineDoc[]> {
  const gid = toObjectId(groupOrderId);
  if (!gid) return [];
  const col = await orderLines();
  return col.find({ groupOrderId: gid }).sort({ createdAt: 1 }).toArray();
}

export async function listLinesForParticipant(
  groupOrderId: string,
  participantId: string,
): Promise<OrderLineDoc[]> {
  const gid = toObjectId(groupOrderId);
  const pid = toObjectId(participantId);
  if (!gid || !pid) return [];
  const col = await orderLines();
  return col.find({ groupOrderId: gid, participantId: pid }).sort({ createdAt: 1 }).toArray();
}

export async function addLine(
  input: Omit<OrderLineDoc, "_id" | "createdAt" | "updatedAt">,
): Promise<OrderLineDoc> {
  const now = new Date();
  const doc: OrderLineDoc = {
    _id: new ObjectId(),
    groupOrderId: input.groupOrderId,
    participantId: input.participantId,
    itemId: input.itemId,
    ...(input.variantId ? { variantId: input.variantId } : {}),
    nameSnapshot: input.nameSnapshot,
    categoryIdSnapshot: input.categoryIdSnapshot,
    priceSnapshot: input.priceSnapshot,
    quantity: input.quantity,
    ...(input.note ? { note: input.note } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const col = await orderLines();
  await col.insertOne(doc);
  return doc;
}

/**
 * Updates a line owned by the participant. Returns false if no line matched
 * (missing, or not owned). An empty `note` string removes the note.
 */
export async function updateLine(
  lineId: string,
  participantId: string,
  input: { quantity?: number; note?: string },
): Promise<boolean> {
  const _id = toObjectId(lineId);
  const pid = toObjectId(participantId);
  if (!_id || !pid) return false;
  const $set: Partial<OrderLineDoc> = { updatedAt: new Date() };
  const $unset: Record<string, ""> = {};
  if (input.quantity !== undefined) $set.quantity = input.quantity;
  if (input.note !== undefined) {
    if (input.note) $set.note = input.note;
    else $unset.note = "";
  }
  const col = await orderLines();
  const res = await col.updateOne(
    { _id, participantId: pid },
    Object.keys($unset).length ? { $set, $unset } : { $set },
  );
  return res.matchedCount > 0;
}

export async function removeLine(lineId: string, participantId: string): Promise<boolean> {
  const _id = toObjectId(lineId);
  const pid = toObjectId(participantId);
  if (!_id || !pid) return false;
  const col = await orderLines();
  const res = await col.deleteOne({ _id, participantId: pid });
  return res.deletedCount > 0;
}

/** Number of distinct participants with at least one line in the order. */
export async function countParticipantsInOrder(groupOrderId: string): Promise<number> {
  const gid = toObjectId(groupOrderId);
  if (!gid) return 0;
  const col = await orderLines();
  const ids = await col.distinct("participantId", { groupOrderId: gid });
  return ids.length;
}
