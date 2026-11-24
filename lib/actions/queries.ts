import "server-only";
import { connection } from "next/server";
import { getCurrentParticipant, requireAdmin } from "@/lib/auth";
import { listAdmins } from "@/lib/data/admins";
import {
  getGroupOrder,
  getGroupOrderByShortCode,
  getOpenOrderForRestaurant,
  listOpenGroupOrders,
  listRecentClosedGroupOrders,
} from "@/lib/data/groupOrders";
import { listLinesForOrder, listLinesForParticipant, listLinesInvolving } from "@/lib/data/orderLines";
import { getParticipantsByIds } from "@/lib/data/participants";
import {
  getRestaurant,
  listPublishedRestaurants,
  listRestaurants,
} from "@/lib/data/restaurants";
import { objectIdStringSchema } from "@/lib/db/schemas";
import { calculateReceipt, calculateReceipts, summarizePayments } from "@/lib/receipts";
import { regroupOrder, regroupedToText } from "@/lib/regroup";
import type {
  AdminDoc,
  GroupOrderDoc,
  GroupOrderStatus,
  Menu,
  MenuStatus,
  Multiplier,
  OrderLineDoc,
  PaymentMethod,
  Receipt,
  RegroupedOrder,
  RestaurantDoc,
  SourceFile,
} from "@/lib/types";
import { serializeLine, type SerializedLine } from "./types";

export type { SerializedLine };

// Plain server read helpers for pages (not Server Actions). Everything returned is
// serializable: string ids, ISO date strings, money in piasters.
// Each helper calls connection() so the DB is only read at request time.

// ---------- Serialized shapes ----------

export type InstaPayInfo = { qrUrl: string | null; handle: string | null };

export type PublicRestaurant = {
  id: string;
  name: string;
  phone?: string;
  coverImageUrl?: string;
  menuStatus: MenuStatus;
  itemCount: number;
};

export type PublicRestaurantWithMenu = PublicRestaurant & { menu: Menu };

export type HomeRestaurant = PublicRestaurant & { openOrderShortCode?: string };

export type AdminRestaurant = PublicRestaurant & {
  menu: Menu;
  draftMenu: Menu | null;
  draftItemCount: number;
  sourceFiles: SourceFile[];
  openOrder: { id: string; shortCode: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedOrder = {
  id: string;
  shortCode: string;
  restaurantId: string;
  title: string;
  status: GroupOrderStatus;
  multiplier: Multiplier;
  createdAt: string;
  closedAt?: string;
  createdByName: string | null;
};

export type SerializedPayment = {
  participantId: string;
  paidAt: string;
  paidMethod: PaymentMethod;
  amountAtPayment: number;
};

export type AdminOrder = SerializedOrder & { payments: SerializedPayment[] };

export type OrderPageData = {
  order: SerializedOrder;
  restaurant: PublicRestaurantWithMenu;
  participant: { id: string; name: string; phone: string } | null;
  myLines: SerializedLine[];
  /** Null when not joined. While the order is open it is an estimate (see isEstimate). */
  myReceipt: Receipt | null;
  isEstimate: boolean;
  instapay: InstaPayInfo;
  /** For "Pay [total] in cash to [name]": the admin who created the order. */
  cashToName: string | null;
};

export type DashboardOrder = {
  order: SerializedOrder;
  restaurantName: string;
  participantCount: number;
  itemCount: number;
  runningTotal: number; // sum of rounded participant totals
  paidCount: number;
  unpaidCount: number;
  collected: number;
  outstanding: number;
};

export type AdminDashboard = {
  admin: { id: string; name: string };
  openOrders: DashboardOrder[];
  recentClosedOrders: DashboardOrder[];
  restaurantCount: number;
};

export type AdminOrderData = {
  order: AdminOrder;
  restaurant: PublicRestaurant;
  receipts: Receipt[];
  regrouped: RegroupedOrder;
  regroupedText: string;
  paidCount: number;
  participantCount: number;
  collected: number;
  outstanding: number;
  grandTotal: number;
  sharePath: string; // "/o/{shortCode}" (prefix with the site origin for the QR / copy link)
  instapay: InstaPayInfo;
};

// ---------- Helpers ----------

function instapay(): InstaPayInfo {
  return {
    qrUrl: process.env.INSTAPAY_QR_URL || "/instapay-qr.png",
    handle: process.env.INSTAPAY_HANDLE || null,
  };
}

function countItems(menu: Menu | undefined | null): number {
  return (menu?.categories ?? []).reduce((n, c) => n + c.items.length, 0);
}

function serializeRestaurant(r: RestaurantDoc): PublicRestaurant {
  const out: PublicRestaurant = {
    id: r._id.toString(),
    name: r.name,
    menuStatus: r.menuStatus,
    itemCount: countItems(r.menu),
  };
  if (r.phone) out.phone = r.phone;
  if (r.coverImageUrl) out.coverImageUrl = r.coverImageUrl;
  return out;
}

/** Strips any non-plain values (e.g. ObjectIds) from a stored menu. */
function plainMenu(menu: Menu | undefined | null): Menu {
  return {
    categories: (menu?.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        ...(i.description ? { description: i.description } : {}),
        price: i.price,
        ...(i.variants && i.variants.length > 0
          ? { variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: v.price })) }
          : {}),
      })),
    })),
  };
}

function serializeOrder(o: GroupOrderDoc, adminNames: Map<string, string>): SerializedOrder {
  const out: SerializedOrder = {
    id: o._id.toString(),
    shortCode: o.shortCode,
    restaurantId: o.restaurantId.toString(),
    title: o.title,
    status: o.status,
    multiplier: o.multiplier,
    createdAt: o.createdAt.toISOString(),
    createdByName: adminNames.get(o.createdBy.toString()) ?? null,
  };
  if (o.closedAt) out.closedAt = o.closedAt.toISOString();
  return out;
}


async function adminNameMap(): Promise<Map<string, string>> {
  const admins: AdminDoc[] = await listAdmins();
  return new Map(admins.map((a) => [a._id.toString(), a.name]));
}

async function peopleForLines(lines: OrderLineDoc[]) {
  const ids = [
    ...new Set(lines.flatMap((l) => [l.participantId.toString(), ...(l.sharedWith ?? []).map((id) => id.toString())])),
  ];
  return getParticipantsByIds(ids);
}

const validId = (id: string) => objectIdStringSchema.safeParse(id).success;

// ---------- Public pages ----------

/** Home page: restaurants with a published menu, each with openOrderShortCode if one is open. */
export async function getHomeData(): Promise<HomeRestaurant[]> {
  await connection();
  const [restaurants, open] = await Promise.all([listPublishedRestaurants(), listOpenGroupOrders()]);
  const openByRestaurant = new Map(open.map((o) => [o.restaurantId.toString(), o.shortCode]));
  return restaurants.map((r) => {
    const out: HomeRestaurant = serializeRestaurant(r);
    const code = openByRestaurant.get(r._id.toString());
    if (code) out.openOrderShortCode = code;
    return out;
  });
}

/** /r/[id]: published menu + open order (if any). Null if missing or not published. */
export async function getRestaurantPage(id: string): Promise<{
  restaurant: PublicRestaurantWithMenu;
  openOrder: { shortCode: string; title: string } | null;
} | null> {
  await connection();
  if (!validId(id)) return null;
  const r = await getRestaurant(id);
  if (!r || r.menuStatus !== "published") return null;
  const open = await getOpenOrderForRestaurant(id);
  return {
    restaurant: { ...serializeRestaurant(r), menu: plainMenu(r.menu) },
    openOrder: open ? { shortCode: open.shortCode, title: open.title } : null,
  };
}

/**
 * /o/[shortCode]. Only the current participant's own lines and receipt are returned
 * (never other people's). Null if the order doesn't exist.
 */
export async function getOrderPageData(shortCode: string): Promise<OrderPageData | null> {
  await connection();
  if (!shortCode || shortCode.length > 64) return null;
  const order = await getGroupOrderByShortCode(shortCode);
  if (!order) return null;
  const [restaurant, person, admins] = await Promise.all([
    getRestaurant(order.restaurantId.toString()),
    getCurrentParticipant(),
    adminNameMap(),
  ]);
  if (!restaurant) return null;

  const [lines, involved] = person
    ? await Promise.all([
        listLinesForParticipant(order._id.toString(), person._id.toString()),
        listLinesInvolving(order._id.toString(), person._id.toString()),
      ])
    : [[], []];
  // Names of people sharing items with this participant (shown as "shared with …").
  const names = new Map((await peopleForLines(involved)).map((p) => [p._id.toString(), p.name]));
  // Payments are filtered to this participant so nothing about others leaks.
  const myOrder = person
    ? {
        ...order,
        payments: order.payments.filter((p) => p.participantId.equals(person._id)),
        paymentChoices: (order.paymentChoices ?? []).filter((c) => c.participantId.equals(person._id)),
        confirmations: (order.confirmations ?? []).filter((c) => c.participantId.equals(person._id)),
      }
    : order;

  return {
    order: serializeOrder(order, admins),
    restaurant: { ...serializeRestaurant(restaurant), menu: plainMenu(restaurant.menu) },
    participant: person
      ? { id: person._id.toString(), name: person.name, phone: person.phone }
      : null,
    myLines: lines.map(serializeLine),
    myReceipt: person ? calculateReceipt(myOrder, involved, person, names) : null,
    isEstimate: order.status === "open",
    instapay: instapay(),
    cashToName: admins.get(order.createdBy.toString()) ?? null,
  };
}

// ---------- Admin pages (each requires an admin; redirects to /admin/login otherwise) ----------

async function dashboardOrder(
  o: GroupOrderDoc,
  restaurantNames: Map<string, string>,
  admins: Map<string, string>,
): Promise<DashboardOrder> {
  const lines = await listLinesForOrder(o._id.toString());
  const people = await peopleForLines(lines);
  const receipts = calculateReceipts(o, lines, people);
  const s = summarizePayments(receipts);
  return {
    order: serializeOrder(o, admins),
    restaurantName: restaurantNames.get(o.restaurantId.toString()) ?? "Deleted restaurant",
    participantCount: s.participantCount,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    runningTotal: s.grandTotal,
    paidCount: s.paidCount,
    unpaidCount: s.participantCount - s.paidCount,
    collected: s.collected,
    outstanding: s.outstanding,
  };
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  await connection();
  const admin = await requireAdmin();
  const [restaurants, open, closed, admins] = await Promise.all([
    listRestaurants(),
    listOpenGroupOrders(),
    listRecentClosedGroupOrders(10),
    adminNameMap(),
  ]);
  const names = new Map(restaurants.map((r) => [r._id.toString(), r.name]));
  const [openOrders, recentClosedOrders] = await Promise.all([
    Promise.all(open.map((o) => dashboardOrder(o, names, admins))),
    Promise.all(closed.map((o) => dashboardOrder(o, names, admins))),
  ]);
  return {
    admin: { id: admin._id.toString(), name: admin.name },
    openOrders,
    recentClosedOrders,
    restaurantCount: restaurants.length,
  };
}

/** /admin/restaurants: every restaurant (any menu status) with its open order, if any. */
export async function getAdminRestaurants(): Promise<AdminRestaurantSummary[]> {
  await connection();
  await requireAdmin();
  const [restaurants, open] = await Promise.all([listRestaurants(), listOpenGroupOrders()]);
  const openBy = new Map(open.map((o) => [o.restaurantId.toString(), o]));
  return restaurants.map((r) => {
    const o = openBy.get(r._id.toString());
    return {
      ...serializeRestaurant(r),
      draftItemCount: countItems(r.draftMenu),
      openOrder: o ? { id: o._id.toString(), shortCode: o.shortCode } : null,
    };
  });
}

export type AdminRestaurantSummary = PublicRestaurant & {
  draftItemCount: number;
  openOrder: { id: string; shortCode: string } | null;
};

/** /admin/restaurants/[id]: full record incl. draftMenu and sourceFiles. Null if missing. */
export async function getAdminRestaurant(id: string): Promise<AdminRestaurant | null> {
  await connection();
  await requireAdmin();
  if (!validId(id)) return null;
  const r = await getRestaurant(id);
  if (!r) return null;
  const o = await getOpenOrderForRestaurant(id);
  return {
    ...serializeRestaurant(r),
    menu: plainMenu(r.menu),
    draftMenu: r.draftMenu ? plainMenu(r.draftMenu) : null,
    draftItemCount: countItems(r.draftMenu),
    sourceFiles: (r.sourceFiles ?? []).map((f) => ({ url: f.url, type: f.type })),
    openOrder: o ? { id: o._id.toString(), shortCode: o.shortCode } : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** /admin/orders/[id]: receipts, regrouped list + WhatsApp text, payment summary. */
export async function getAdminOrderData(id: string): Promise<AdminOrderData | null> {
  await connection();
  await requireAdmin();
  if (!validId(id)) return null;
  const order = await getGroupOrder(id);
  if (!order) return null;
  const [restaurant, lines, admins] = await Promise.all([
    getRestaurant(order.restaurantId.toString()),
    listLinesForOrder(id),
    adminNameMap(),
  ]);
  const people = await peopleForLines(lines);
  const receipts = calculateReceipts(order, lines, people);
  const summary = summarizePayments(receipts);
  const menuSource: Pick<RestaurantDoc, "menu"> = { menu: restaurant?.menu ?? { categories: [] } };
  const regrouped = regroupOrder(order, menuSource, lines, people);
  const restaurantName = restaurant?.name ?? "Deleted restaurant";

  return {
    order: {
      ...serializeOrder(order, admins),
      payments: order.payments.map((p) => ({
        participantId: p.participantId.toString(),
        paidAt: p.paidAt.toISOString(),
        paidMethod: p.paidMethod,
        amountAtPayment: p.amountAtPayment,
      })),
    },
    restaurant: restaurant
      ? serializeRestaurant(restaurant)
      : { id: order.restaurantId.toString(), name: restaurantName, menuStatus: "empty", itemCount: 0 },
    receipts,
    regrouped,
    regroupedText: regroupedToText({ name: restaurantName }, regrouped),
    paidCount: summary.paidCount,
    participantCount: summary.participantCount,
    collected: summary.collected,
    outstanding: summary.outstanding,
    grandTotal: summary.grandTotal,
    sharePath: `/o/${order.shortCode}`,
    instapay: instapay(),
  };
}
