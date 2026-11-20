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
  return col.findOne({ token });
}

export async function setAdminToken(adminId: string, token: string | null): Promise<void> {
  const _id = toObjectId(adminId);
  if (!_id) return;
  const col = await admins();
  if (token === null) {
    await col.updateOne({ _id }, { $unset: { token: "" } });
  } else {
    await col.updateOne({ _id }, { $set: { token } });
  }
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
