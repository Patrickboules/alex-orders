import "server-only";
import { customAlphabet } from "nanoid";
import { ObjectId } from "mongodb";
import { groupOrders } from "@/lib/db/collections";
import type {
  GroupOrderDoc,
  GroupOrderStatus,
  Multiplier,
  PaymentMethod,
  PaymentRecord,
} from "@/lib/types";
import { isDuplicateKeyError, toObjectId } from "./ids";

// No ambiguous characters (0/O, 1/l/I).
const SHORT_CODE_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const generateShortCode = customAlphabet(SHORT_CODE_ALPHABET, 8);
const MAX_SHORT_CODE_ATTEMPTS = 5;

export async function createGroupOrder(input: {
  restaurantId: string | ObjectId;
  title: string;
  multiplier: Multiplier;
  createdBy: string | ObjectId;
}): Promise<GroupOrderDoc> {
  const restaurantId = toObjectId(input.restaurantId);
  const createdBy = toObjectId(input.createdBy);
  if (!restaurantId) throw new Error("createGroupOrder: invalid restaurantId");
  if (!createdBy) throw new Error("createGroupOrder: invalid createdBy");
  const col = await groupOrders();

  for (let attempt = 1; ; attempt++) {
    const doc: GroupOrderDoc = {
      _id: new ObjectId(),
      shortCode: generateShortCode(),
      restaurantId,
      title: input.title,
      status: "open",
      multiplier: input.multiplier,
      createdBy,
      createdAt: new Date(),
      payments: [],
    };
    try {
      await col.insertOne(doc);
      return doc;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt >= MAX_SHORT_CODE_ATTEMPTS) throw err;
    }
  }
}

export async function getGroupOrder(id: string): Promise<GroupOrderDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const col = await groupOrders();
  return col.findOne({ _id });
}

export async function getGroupOrderByShortCode(code: string): Promise<GroupOrderDoc | null> {
  if (!code || typeof code !== "string") return null;
  const col = await groupOrders();
  return col.findOne({ shortCode: code });
}

export async function getOpenOrderForRestaurant(
  restaurantId: string,
): Promise<GroupOrderDoc | null> {
  const rid = toObjectId(restaurantId);
  if (!rid) return null;
  const col = await groupOrders();
  return col.findOne({ restaurantId: rid, status: "open" }, { sort: { createdAt: -1 } });
}

export async function listOpenGroupOrders(): Promise<GroupOrderDoc[]> {
  const col = await groupOrders();
  return col.find({ status: "open" }).sort({ createdAt: -1 }).toArray();
}

export async function listRecentClosedGroupOrders(limit: number): Promise<GroupOrderDoc[]> {
  const n = Math.max(1, Math.floor(Number(limit) || 0));
  const col = await groupOrders();
  return col.find({ status: "closed" }).sort({ closedAt: -1 }).limit(n).toArray();
}

export async function setGroupOrderStatus(id: string, status: GroupOrderStatus): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const col = await groupOrders();
  if (status === "closed") {
    await col.updateOne({ _id }, { $set: { status, closedAt: new Date() } });
  } else {
    await col.updateOne({ _id }, { $set: { status }, $unset: { closedAt: "" } });
  }
}

export async function updateGroupOrder(
  id: string,
  input: { title?: string; multiplier?: Multiplier },
): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const $set: Partial<GroupOrderDoc> = {};
  if (input.title !== undefined) $set.title = input.title;
  if (input.multiplier !== undefined) $set.multiplier = input.multiplier;
  if (Object.keys($set).length === 0) return;
  const col = await groupOrders();
  await col.updateOne({ _id }, { $set });
}

/** Records (or clears, with null) a participant's payment. Replaces any existing record. */
export async function setPayment(
  id: string,
  participantId: string,
  payment: { paidMethod: PaymentMethod; amountAtPayment: number } | null,
): Promise<void> {
  const _id = toObjectId(id);
  const pid = toObjectId(participantId);
  if (!_id || !pid) return;
  const col = await groupOrders();
  await col.updateOne({ _id }, { $pull: { payments: { participantId: pid } } });
  if (payment) {
    const record: PaymentRecord = {
      participantId: pid,
      paidAt: new Date(),
      paidMethod: payment.paidMethod,
      amountAtPayment: payment.amountAtPayment,
    };
    await col.updateOne({ _id }, { $push: { payments: record } });
  }
}

/** Records how a participant says they'll pay (replaces any earlier choice). */
export async function setPaymentChoice(id: string, participantId: string, method: PaymentMethod): Promise<void> {
  const _id = toObjectId(id);
  const pid = toObjectId(participantId);
  if (!_id || !pid) return;
  const col = await groupOrders();
  await col.updateOne({ _id }, { $pull: { paymentChoices: { participantId: pid } } });
  await col.updateOne({ _id }, { $push: { paymentChoices: { participantId: pid, method, chosenAt: new Date() } } });
}
