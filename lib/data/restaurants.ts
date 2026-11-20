import "server-only";
import { ObjectId } from "mongodb";
import { restaurants } from "@/lib/db/collections";
import type { Menu, RestaurantDoc, SourceFile } from "@/lib/types";
import { toObjectId } from "./ids";

export async function listRestaurants(): Promise<RestaurantDoc[]> {
  const col = await restaurants();
  return col.find({}).sort({ name: 1 }).toArray();
}

export async function listPublishedRestaurants(): Promise<RestaurantDoc[]> {
  const col = await restaurants();
  return col.find({ menuStatus: "published" }).sort({ name: 1 }).toArray();
}

export async function getRestaurant(id: string): Promise<RestaurantDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const col = await restaurants();
  return col.findOne({ _id });
}

export async function createRestaurant(input: {
  name: string;
  phone?: string;
  coverImageUrl?: string;
  createdBy: string | ObjectId;
}): Promise<RestaurantDoc> {
  const createdBy = toObjectId(input.createdBy);
  if (!createdBy) throw new Error("createRestaurant: invalid createdBy id");
  const now = new Date();
  const doc: RestaurantDoc = {
    _id: new ObjectId(),
    name: input.name,
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.coverImageUrl ? { coverImageUrl: input.coverImageUrl } : {}),
    menuStatus: "empty",
    menu: { categories: [] },
    sourceFiles: [],
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const col = await restaurants();
  await col.insertOne(doc);
  return doc;
}

/**
 * Updates basic fields. A field passed as `undefined` is left unchanged;
 * `phone` / `coverImageUrl` passed as an empty string are removed.
 */
export async function updateRestaurant(
  id: string,
  input: { name?: string; phone?: string; coverImageUrl?: string },
): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const $set: Partial<RestaurantDoc> = { updatedAt: new Date() };
  const $unset: Record<string, ""> = {};
  if (input.name !== undefined) $set.name = input.name;
  if (input.phone !== undefined) {
    if (input.phone) $set.phone = input.phone;
    else $unset.phone = "";
  }
  if (input.coverImageUrl !== undefined) {
    if (input.coverImageUrl) $set.coverImageUrl = input.coverImageUrl;
    else $unset.coverImageUrl = "";
  }
  const col = await restaurants();
  await col.updateOne(
    { _id },
    Object.keys($unset).length ? { $set, $unset } : { $set },
  );
}

export async function deleteRestaurant(id: string): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const col = await restaurants();
  await col.deleteOne({ _id });
}

/** Saves a parse result as the draft menu. menuStatus becomes "draft" unless already "published". */
export async function saveDraftMenu(
  id: string,
  menu: Menu,
  sourceFiles: SourceFile[],
): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const col = await restaurants();
  // Pipeline update so menuStatus can be computed from the current value atomically.
  await col.updateOne({ _id }, [
    {
      $set: {
        draftMenu: { $literal: menu },
        sourceFiles: { $literal: sourceFiles },
        updatedAt: "$$NOW",
        menuStatus: {
          $cond: [{ $eq: ["$menuStatus", "published"] }, "published", "draft"],
        },
      },
    },
  ]);
}

/** Saves admin edits to the draft menu. */
export async function saveMenuEdits(id: string, menu: Menu): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const col = await restaurants();
  await col.updateOne({ _id }, { $set: { draftMenu: menu, updatedAt: new Date() } });
}

/** Copies draftMenu to menu and marks the menu published. No-op if there is no draft. */
export async function publishMenu(id: string): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const col = await restaurants();
  await col.updateOne({ _id, draftMenu: { $exists: true } }, [
    {
      $set: {
        menu: "$draftMenu",
        menuStatus: "published",
        updatedAt: "$$NOW",
      },
    },
  ]);
}
