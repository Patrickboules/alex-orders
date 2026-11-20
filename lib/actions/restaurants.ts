"use server";

import { revalidatePath } from "next/cache";
import { getCurrentAdmin } from "@/lib/auth";
import { getOpenOrderForRestaurant } from "@/lib/data/groupOrders";
import {
  createRestaurant,
  deleteRestaurant,
  getRestaurant,
  publishMenu,
  saveMenuEdits,
  updateRestaurant,
} from "@/lib/data/restaurants";
import { menuSchema, objectIdStringSchema, restaurantInputSchema } from "@/lib/db/schemas";
import { uploadFile } from "@/lib/storage";
import type { Menu } from "@/lib/types";
import { NOT_AUTHORIZED, firstZodError, pickFormData, type ActionResult } from "./types";

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

function revalidateRestaurant(id?: string) {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/restaurants");
  if (id) {
    revalidatePath(`/admin/restaurants/${id}`);
    revalidatePath(`/r/${id}`);
  }
}

/** Uploads the "cover" file field if present. Returns url, undefined (no file) or an error. */
async function handleCover(formData: FormData): Promise<{ url?: string; error?: string }> {
  const file = formData.get("cover") ?? formData.get("coverImage");
  if (!(file instanceof File) || file.size === 0) return {};
  if (!COVER_TYPES.has(file.type)) return { error: "Cover image must be JPG, PNG, WEBP, GIF or AVIF" };
  if (file.size > MAX_COVER_BYTES) return { error: "Cover image must be 5 MB or smaller" };
  const url = await uploadFile(Buffer.from(await file.arrayBuffer()), file.name, file.type);
  return { url };
}

function str(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  return typeof v === "string" ? v : undefined;
}

/**
 * Form fields: name (required), phone (optional), cover (optional image File).
 * Returns { id } of the new restaurant. Works as action(formData) or with useActionState.
 */
export async function createRestaurantAction(
  prevOrForm: unknown,
  maybeForm?: unknown,
): Promise<ActionResult<{ id: string }>> {
  const formData = pickFormData(prevOrForm, maybeForm);
  if (!formData) return { ok: false, error: "Invalid form" };
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };

    const parsed = restaurantInputSchema.safeParse({
      name: str(formData, "name") ?? "",
      phone: str(formData, "phone"),
    });
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

    const cover = await handleCover(formData);
    if (cover.error) return { ok: false, error: cover.error };

    const doc = await createRestaurant({
      name: parsed.data.name,
      phone: parsed.data.phone,
      coverImageUrl: cover.url,
      createdBy: admin._id,
    });
    revalidateRestaurant(doc._id.toString());
    return { ok: true, data: { id: doc._id.toString() } };
  } catch (err) {
    console.error("createRestaurantAction failed", err);
    return { ok: false, error: "Could not create the restaurant. Please try again." };
  }
}

/**
 * Form fields: name, phone ("" clears it), cover (new image File), removeCover ("1" clears it).
 * Usable as updateRestaurantAction(id, formData) or useActionState(updateRestaurantAction.bind(null, id)).
 */
export async function updateRestaurantAction(
  id: string,
  prevOrForm: unknown,
  maybeForm?: unknown,
): Promise<ActionResult> {
  const formData = pickFormData(prevOrForm, maybeForm);
  if (!formData) return { ok: false, error: "Invalid form" };
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    if (!objectIdStringSchema.safeParse(id).success) return { ok: false, error: "Restaurant not found" };
    const existing = await getRestaurant(id);
    if (!existing) return { ok: false, error: "Restaurant not found" };

    const parsed = restaurantInputSchema.safeParse({
      name: str(formData, "name") ?? existing.name,
      phone: str(formData, "phone"),
    });
    if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

    const cover = await handleCover(formData);
    if (cover.error) return { ok: false, error: cover.error };

    const phoneField = str(formData, "phone");
    await updateRestaurant(id, {
      name: parsed.data.name,
      // Field present but empty -> clear; absent -> unchanged.
      phone: phoneField === undefined ? undefined : (parsed.data.phone ?? ""),
      coverImageUrl: cover.url ?? (str(formData, "removeCover") === "1" ? "" : undefined),
    });
    revalidateRestaurant(id);
    return { ok: true };
  } catch (err) {
    console.error("updateRestaurantAction failed", err);
    return { ok: false, error: "Could not save the restaurant. Please try again." };
  }
}

/** Blocked while the restaurant has an open group order. */
export async function deleteRestaurantAction(id: string): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    if (!objectIdStringSchema.safeParse(id).success) return { ok: false, error: "Restaurant not found" };
    if (!(await getRestaurant(id))) return { ok: false, error: "Restaurant not found" };
    if (await getOpenOrderForRestaurant(id)) {
      return { ok: false, error: "This restaurant has an open group order. Close it before deleting." };
    }
    await deleteRestaurant(id);
    revalidateRestaurant(id);
    return { ok: true };
  } catch (err) {
    console.error("deleteRestaurantAction failed", err);
    return { ok: false, error: "Could not delete the restaurant. Please try again." };
  }
}

/** Saves the edited menu as the draft (zero prices allowed here; publishing checks them). */
export async function saveMenuEditsAction(id: string, menu: Menu): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    if (!objectIdStringSchema.safeParse(id).success) return { ok: false, error: "Restaurant not found" };
    const parsed = menuSchema.safeParse(menu);
    if (!parsed.success) return { ok: false, error: `Menu is invalid: ${firstZodError(parsed.error)}` };
    if (!(await getRestaurant(id))) return { ok: false, error: "Restaurant not found" };
    await saveMenuEdits(id, parsed.data as Menu);
    revalidateRestaurant(id);
    return { ok: true };
  } catch (err) {
    console.error("saveMenuEditsAction failed", err);
    return { ok: false, error: "Could not save the menu. Please try again." };
  }
}

/** Item/variant ids whose price is missing or ≤ 0. */
function invalidPriceIds(menu: Menu): string[] {
  const bad: string[] = [];
  for (const cat of menu.categories) {
    for (const item of cat.items) {
      const variants = item.variants ?? [];
      if (variants.length === 0) {
        if (!(item.price > 0)) bad.push(item.id);
      } else {
        for (const v of variants) if (!(v.price > 0)) bad.push(v.id);
      }
    }
  }
  return bad;
}

/**
 * Publishes the draft menu (menu = draftMenu). Pass `menu` to save edits first
 * (Publish button = save + publish). Blocked if any price is ≤ 0 or the menu is empty.
 */
export async function publishMenuAction(
  id: string,
  menu?: Menu,
): Promise<ActionResult> {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) return { ok: false, error: NOT_AUTHORIZED };
    if (!objectIdStringSchema.safeParse(id).success) return { ok: false, error: "Restaurant not found" };
    const restaurant = await getRestaurant(id);
    if (!restaurant) return { ok: false, error: "Restaurant not found" };

    let draft: Menu | undefined = restaurant.draftMenu;
    if (menu !== undefined) {
      const parsed = menuSchema.safeParse(menu);
      if (!parsed.success) return { ok: false, error: `Menu is invalid: ${firstZodError(parsed.error)}` };
      draft = parsed.data as Menu;
      await saveMenuEdits(id, draft);
    }
    if (!draft) return { ok: false, error: "There is no draft menu to publish" };

    const itemCount = draft.categories.reduce((n, c) => n + c.items.length, 0);
    if (itemCount === 0) return { ok: false, error: "The menu has no items" };

    const bad = invalidPriceIds(draft);
    if (bad.length > 0) {
      const msg =
        bad.length === 1
          ? "1 item has a missing or zero price. Fix it before publishing."
          : `${bad.length} items have a missing or zero price. Fix them before publishing.`;
      return { ok: false, error: msg };
    }

    await publishMenu(id);
    revalidateRestaurant(id);
    return { ok: true };
  } catch (err) {
    console.error("publishMenuAction failed", err);
    return { ok: false, error: "Could not publish the menu. Please try again." };
  }
}
