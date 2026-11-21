import "server-only";
import { ObjectId } from "mongodb";
import { groupOrders, orderLines, restaurants } from "@/lib/db/collections";
import type { Menu, MenuItem, RestaurantDoc, SourceFile } from "@/lib/types";
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
  const published = await col.findOne({ _id }, { projection: { menu: 1 } });
  if (published) await repriceOpenOrders(_id, published.menu);
}

/** Re-applies the current published menu's prices to the restaurant's open orders. */
export async function repriceOpenOrdersFor(id: string): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const r = await (await restaurants()).findOne({ _id }, { projection: { menu: 1 } });
  if (r) await repriceOpenOrders(_id, r.menu);
}

const norm = (s: string) => s.trim().toLocaleLowerCase();

/**
 * Brings items already in this restaurant's OPEN orders in line with the newly
 * published menu (price, name, category). Closed orders keep what they had.
 * Matches by item/variant id, then by name (ids change when a menu is re-parsed).
 * Lines whose item is no longer on the menu are left as they are.
 */
async function repriceOpenOrders(restaurantId: ObjectId, menu: Menu): Promise<void> {
  const open = await (await groupOrders())
    .find({ restaurantId, status: "open" }, { projection: { _id: 1 } })
    .toArray();
  if (open.length === 0) return;

  const byId = new Map<string, { item: MenuItem; categoryId: string }>();
  const byName = new Map<string, { item: MenuItem; categoryId: string }>();
  for (const c of menu.categories) {
    for (const item of c.items) {
      byId.set(item.id, { item, categoryId: c.id });
      if (!byName.has(norm(item.name))) byName.set(norm(item.name), { item, categoryId: c.id });
    }
  }

  const linesCol = await orderLines();
  const lines = await linesCol.find({ groupOrderId: { $in: open.map((o) => o._id) } }).toArray();
  const ops = [];
  for (const line of lines) {
    // Old line names are "Item" or "Item – Variant".
    const [oldItemName, oldVariantName] = line.nameSnapshot.split(" – ");
    const found = byId.get(line.itemId) ?? byName.get(norm(oldItemName));
    if (!found) continue;
    const { item, categoryId } = found;
    const variants = item.variants ?? [];
    let name = item.name;
    let price = item.price;
    let variantId: string | undefined;
    if (variants.length > 0) {
      const variant =
        variants.find((v) => v.id === line.variantId) ??
        (oldVariantName ? variants.find((v) => norm(v.name) === norm(oldVariantName)) : undefined);
      if (!variant) continue;
      name = `${item.name} – ${variant.name}`;
      price = variant.price;
      variantId = variant.id;
    }
    if (!(price > 0)) continue;
    const unchanged =
      line.priceSnapshot === price &&
      line.nameSnapshot === name &&
      line.itemId === item.id &&
      line.variantId === variantId &&
      line.categoryIdSnapshot === categoryId;
    if (unchanged) continue;
    const set = { itemId: item.id, nameSnapshot: name, priceSnapshot: price, categoryIdSnapshot: categoryId, updatedAt: new Date() };
    ops.push({
      updateOne: {
        filter: { _id: line._id },
        update: variantId ? { $set: { ...set, variantId } } : { $set: set, $unset: { variantId: "" as const } },
      },
    });
  }
  if (ops.length > 0) await linesCol.bulkWrite(ops);
}
