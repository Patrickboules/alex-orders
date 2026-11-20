// The menu tools Claude uses to save menus it read from photos.
// Shared by the local stdio server (scripts/mcp-server.ts) and the web endpoint (app/api/mcp).

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { listAdmins, findAdminByPhone } from "@/lib/data/admins";
import {
  createRestaurant,
  getRestaurant,
  listRestaurants,
  publishMenu,
  saveDraftMenu,
} from "@/lib/data/restaurants";
import { countItems, mergeMenus, type RawMenu } from "@/lib/parse/index";
import { normalizeEgyptPhone } from "@/lib/phone";
import type { Menu } from "@/lib/types";

// Base URL for review links; on Vercel falls back to the production domain.
const APP_URL = (
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");

const variantInput = z.object({
  name: z.string().min(1).describe('Size/option name as printed, e.g. "طبق", "ساندوتش", "Single"'),
  price: z.number().nonnegative().describe("Price in EGP, e.g. 42 or 37.5"),
});

const itemInput = z.object({
  name: z.string().min(1).describe("Item name exactly as printed (keep Arabic as Arabic)"),
  description: z.string().optional().describe("Only if the menu prints one"),
  price: z
    .number()
    .nonnegative()
    .optional()
    .describe("Price in EGP for single-price items. Omit when variants are given."),
  variants: z
    .array(variantInput)
    .optional()
    .describe('One entry per available size. Leave out sizes marked "-" on the menu.'),
});

const categoryInput = z.object({
  name: z.string().min(1).describe("Category heading as printed"),
  items: z.array(itemInput).min(1),
});

/** Converts a stored menu (piasters) back to the EGP shape mergeMenus expects. */
function toRaw(menu: Menu): RawMenu {
  return {
    categories: menu.categories.map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({
        name: i.name,
        description: i.description,
        price: i.price / 100,
        variants: i.variants?.map((v) => ({ name: v.name, price: v.price / 100 })),
      })),
    })),
  };
}

function toEgpView(menu: Menu | undefined) {
  if (!menu) return null;
  return toRaw(menu).categories;
}

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function resolveAdminId(): Promise<string | null> {
  const phone = process.env.MCP_ADMIN_PHONE ? normalizeEgyptPhone(process.env.MCP_ADMIN_PHONE) : null;
  const admin = phone ? await findAdminByPhone(phone) : (await listAdmins())[0];
  return admin ? admin._id.toString() : null;
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "alex-orders", version: "1.0.0" });

  server.registerTool(
    "list_restaurants",
    {
      title: "List restaurants",
      description: "Lists every restaurant with its id, menu status and item counts.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const all = await listRestaurants();
      return json(
        all.map((r) => ({
          id: r._id.toString(),
          name: r.name,
          menuStatus: r.menuStatus,
          publishedItems: countItems(r.menu),
          draftItems: r.draftMenu ? countItems(r.draftMenu) : 0,
          reviewUrl: `${APP_URL}/admin/restaurants/${r._id}`,
        })),
      );
    },
  );

  server.registerTool(
    "create_restaurant",
    {
      title: "Create restaurant",
      description: "Creates a restaurant (no menu yet). Returns its id.",
      inputSchema: { name: z.string().min(1).max(80), phone: z.string().optional() },
    },
    async ({ name, phone }) => {
      const adminId = await resolveAdminId();
      if (!adminId) return fail("No admin account exists. Run npm run seed:admin first.");
      const r = await createRestaurant({ name: name.trim(), phone: phone?.trim() || undefined, createdBy: adminId });
      return json({ id: r._id.toString(), name: r.name, reviewUrl: `${APP_URL}/admin/restaurants/${r._id}` });
    },
  );

  server.registerTool(
    "get_menu",
    {
      title: "Get menu",
      description: "Returns a restaurant's draft and published menus, prices in EGP.",
      inputSchema: { restaurantId: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ restaurantId }) => {
      const r = await getRestaurant(restaurantId);
      if (!r) return fail("Restaurant not found");
      return json({ name: r.name, menuStatus: r.menuStatus, draft: toEgpView(r.draftMenu), published: toEgpView(r.menu) });
    },
  );

  server.registerTool(
    "save_menu_draft",
    {
      title: "Save menu draft",
      description: [
        "Saves a menu you transcribed from photos/PDFs as the restaurant's DRAFT (not visible to participants until published).",
        "Transcribe every item exactly as printed: keep Arabic in Arabic, convert Arabic-Indic digits to numbers, prices in EGP.",
        'When a menu has price columns (e.g. "طبق" / "ساندوتش"), give each item one variant per column that has a price; skip columns marked "-".',
        'mode "replace" (default) overwrites the draft; "append" adds to it (use when sending one page at a time). Same-name categories are merged.',
      ].join(" "),
      inputSchema: {
        restaurantId: z.string(),
        categories: z.array(categoryInput).min(1),
        mode: z.enum(["replace", "append"]).optional(),
      },
    },
    async ({ restaurantId, categories, mode }) => {
      const r = await getRestaurant(restaurantId);
      if (!r) return fail("Restaurant not found");
      const incoming: RawMenu = {
        categories: categories.map((c) => ({
          name: c.name,
          items: c.items.map((i) => ({ name: i.name, description: i.description, price: i.price ?? null, variants: i.variants })),
        })),
      };
      const base = mode === "append" ? (r.draftMenu ?? (r.menuStatus === "published" ? r.menu : undefined)) : undefined;
      const menu = mergeMenus(base ? [toRaw(base), incoming] : [incoming]);
      const zeroPriced = menu.categories.flatMap((c) => c.items.filter((i) => i.price <= 0).map((i) => i.name));
      await saveDraftMenu(restaurantId, menu, r.sourceFiles ?? []);
      return json({
        saved: true,
        categories: menu.categories.length,
        items: countItems(menu),
        zeroPricedItems: zeroPriced,
        next: `Review and publish at ${APP_URL}/admin/restaurants/${restaurantId}, or call publish_menu.`,
      });
    },
  );

  server.registerTool(
    "publish_menu",
    {
      title: "Publish menu",
      description: "Publishes the restaurant's draft menu so participants can order from it. Refuses if any item has no price.",
      inputSchema: { restaurantId: z.string() },
    },
    async ({ restaurantId }) => {
      const r = await getRestaurant(restaurantId);
      if (!r) return fail("Restaurant not found");
      if (!r.draftMenu || countItems(r.draftMenu) === 0) return fail("There is no draft menu to publish");
      const missing = r.draftMenu.categories.flatMap((c) =>
        c.items.filter((i) => i.price <= 0 || i.variants?.some((v) => v.price <= 0)).map((i) => i.name),
      );
      if (missing.length) return fail(`These items have no price: ${missing.join(", ")}`);
      await publishMenu(restaurantId);
      return json({ published: true, items: countItems(r.draftMenu) });
    },
  );

  return server;
}
