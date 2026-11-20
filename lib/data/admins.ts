import "server-only";
import { ObjectId } from "mongodb";
import { admins } from "@/lib/db/collections";
import type { AdminDoc } from "@/lib/types";
import { toObjectId } from "./ids";

export async function findAdminByPhone(phone: string): Promise<AdminDoc | null> {
  if (!phone) return null;
  const col = await admins();
  return col.findOne({ phone });
}

export async function findAdminByToken(token: string): Promise<AdminDoc | null> {
  if (!token) return null;
  const col = await admins();
  return col.findOne({ tokens: token });
}

const MAX_DEVICES = 10;

/** Adds a login token, keeping other devices signed in (oldest dropped past MAX_DEVICES). */
export async function addAdminToken(adminId: string, token: string): Promise<void> {
  const _id = toObjectId(adminId);
  if (!_id) return;
  const col = await admins();
  await col.updateOne({ _id }, { $push: { tokens: { $each: [token], $slice: -MAX_DEVICES } } });
}

/** Signs out one device. */
export async function removeAdminToken(adminId: string, token: string): Promise<void> {
  const _id = toObjectId(adminId);
  if (!_id) return;
  const col = await admins();
  await col.updateOne({ _id }, { $pull: { tokens: token } });
}

export async function countAdmins(): Promise<number> {
  const col = await admins();
  return col.countDocuments();
}

export async function createAdmin(input: {
  name: string;
  phone: string;
  passwordHash: string;
}): Promise<AdminDoc> {
  const col = await admins();
  const doc: AdminDoc = {
    _id: new ObjectId(),
    name: input.name,
    phone: input.phone,
    passwordHash: input.passwordHash,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return doc;
}

export async function listAdmins(): Promise<AdminDoc[]> {
  const col = await admins();
  return col.find({}).sort({ createdAt: 1 }).toArray();
}
