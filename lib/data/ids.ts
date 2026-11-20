import "server-only";
import { ObjectId } from "mongodb";

/** Safely converts a string (or ObjectId) to an ObjectId. Returns null for invalid input. */
export function toObjectId(id: string | ObjectId | null | undefined): ObjectId | null {
  if (id instanceof ObjectId) return id;
  if (typeof id !== "string" || !ObjectId.isValid(id)) return null;
  // ObjectId.isValid accepts any 12-char string; require 24 hex chars.
  if (!/^[0-9a-fA-F]{24}$/.test(id)) return null;
  return new ObjectId(id);
}

/** Converts a list of ids, dropping invalid ones. */
export function toObjectIds(ids: (string | ObjectId)[]): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ids) {
    const oid = toObjectId(id);
    if (oid) out.push(oid);
  }
  return out;
}

export function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}
