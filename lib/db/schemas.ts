import { z } from "zod";

// Zod schemas for the Menu shape and for the input of every write.
// All prices are integers in piasters (1 EGP = 100 piasters).
// This file has no server-only imports so client components may use it too.

/** Trimmed string; "" (e.g. from an empty form field) becomes undefined. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const piastersSchema = z.number().int().min(0);

export const objectIdStringSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid id");

// ---------- Menu ----------

export const menuVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  price: piastersSchema,
});

export const menuItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: optionalText(1000),
  price: piastersSchema,
  variants: z.array(menuVariantSchema).optional(),
});

export const menuCategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  items: z.array(menuItemSchema),
});

export const menuSchema = z.object({
  categories: z.array(menuCategorySchema),
});

// ---------- Write inputs ----------

export const restaurantInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: optionalText(30),
  coverImageUrl: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
});

export const multiplierSchema = z.union([z.literal(1.14), z.literal(1.26)]);

export const groupOrderInputSchema = z.object({
  restaurantId: objectIdStringSchema,
  title: optionalText(120),
  multiplier: multiplierSchema,
});

export const orderLineInputSchema = z.object({
  shortCode: z.string().trim().min(1).max(64),
  itemId: z.string().min(1),
  variantId: optionalText(64),
  quantity: z.number().int().min(1).max(20),
  note: optionalText(140),
});

/** Phone is the raw user input; normalize it with normalizeEgyptPhone (lib/phone.ts). */
export const joinInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  phone: z.string().trim().min(1, "Phone is required").max(30),
});

export type MenuInput = z.infer<typeof menuSchema>;
export type RestaurantInput = z.infer<typeof restaurantInputSchema>;
export type GroupOrderInput = z.infer<typeof groupOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type JoinInput = z.infer<typeof joinInputSchema>;
