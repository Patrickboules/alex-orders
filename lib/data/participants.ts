import "server-only";
import { nanoid } from "nanoid";
import type { ObjectId } from "mongodb";
import { participants } from "@/lib/db/collections";
import type { ParticipantDoc } from "@/lib/types";
import { isDuplicateKeyError, toObjectIds } from "./ids";

export async function findParticipantByToken(token: string): Promise<ParticipantDoc | null> {
  if (!token) return null;
  const col = await participants();
  return col.findOne({ token });
}

/**
 * Finds the participant by (already normalized) phone, updates the name, and
 * creates it with a fresh token if it doesn't exist. The existing token is reused.
 */
export async function upsertParticipantByPhone(input: {
  name: string;
  phone: string;
}): Promise<ParticipantDoc> {
  const col = await participants();
  const run = () =>
    col.findOneAndUpdate(
      { phone: input.phone },
      {
        $set: { name: input.name },
        $setOnInsert: { token: nanoid(32), createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after" },
    );
  let doc: ParticipantDoc | null;
  try {
    doc = await run();
  } catch (err) {
    // Two concurrent upserts on a unique phone index: retry once as an update.
    if (!isDuplicateKeyError(err)) throw err;
    doc = await run();
  }
  if (!doc) throw new Error("upsertParticipantByPhone: upsert returned no document");
  return doc;
}

export async function getParticipantsByIds(
  ids: (string | ObjectId)[],
): Promise<ParticipantDoc[]> {
  const oids = toObjectIds(ids);
  if (oids.length === 0) return [];
  const col = await participants();
  return col.find({ _id: { $in: oids } }).toArray();
}
