// Combines everyone's lines into one list for the restaurant (US-013, FR-17).
// Pure functions: no DB, no Next.js imports.

import type {
  GroupOrderDoc,
  OrderLineDoc,
  ParticipantDoc,
  RegroupedLine,
  RegroupedOrder,
  RestaurantDoc,
} from "@/lib/types";
import { formatEGP } from "@/lib/money";
import { calculateReceipts } from "@/lib/receipts";

const OTHER_CATEGORY_ID = "__other__";

type Position = { cat: number; item: number; variant: number; categoryId: string };

function menuPositions(restaurant: Pick<RestaurantDoc, "menu">) {
  const categoryOrder = new Map<string, { index: number; name: string }>();
  const itemPos = new Map<string, Position>(); // key itemId|variantId
  (restaurant.menu?.categories ?? []).forEach((cat, ci) => {
    categoryOrder.set(cat.id, { index: ci, name: cat.name });
    cat.items.forEach((item, ii) => {
      itemPos.set(`${item.id}|`, { cat: ci, item: ii, variant: -1, categoryId: cat.id });
      (item.variants ?? []).forEach((v, vi) => {
        itemPos.set(`${item.id}|${v.id}`, { cat: ci, item: ii, variant: vi, categoryId: cat.id });
      });
    });
  });
  return { categoryOrder, itemPos };
}

/**
 * Lines with the same item + variant are combined. If the menu price changed between
 * lines (priceSnapshot differs), they stay on separate rows so line totals stay exact.
 * Categories and items follow the restaurant's published menu order; items no longer
 * on the menu go to their snapshot category (if it still exists) or "Other" at the end.
 */
export function regroupOrder(
  order: Pick<GroupOrderDoc, "multiplier" | "payments" | "perPersonFee">,
  restaurant: Pick<RestaurantDoc, "menu">,
  lines: OrderLineDoc[],
  people: Pick<ParticipantDoc, "_id" | "name" | "phone">[],
): RegroupedOrder {
  const { categoryOrder, itemPos } = menuPositions(restaurant);
  const names = new Map(people.map((p) => [p._id.toString(), p.name]));

  type Acc = RegroupedLine & { sort: [number, number, number, number] };
  const combined = new Map<string, Acc>();

  const sorted = [...lines]
    .filter((l) => l.quantity > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  for (const line of sorted) {
    const variantKey = line.variantId ?? "";
    const key = `${line.itemId}|${variantKey}|${line.priceSnapshot}`;
    let acc = combined.get(key);
    if (!acc) {
      const pos =
        itemPos.get(`${line.itemId}|${variantKey}`) ?? itemPos.get(`${line.itemId}|`);
      let categoryId: string;
      let sort: Acc["sort"];
      if (pos) {
        categoryId = pos.categoryId;
        sort = [pos.cat, pos.item, pos.variant, line.priceSnapshot];
      } else {
        const snap = categoryOrder.get(line.categoryIdSnapshot);
        categoryId = snap ? line.categoryIdSnapshot : OTHER_CATEGORY_ID;
        sort = [snap ? snap.index : Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, line.priceSnapshot];
      }
      acc = {
        itemId: line.itemId,
        name: line.nameSnapshot,
        categoryId,
        totalQuantity: 0,
        unitPrice: line.priceSnapshot,
        lineTotal: 0,
        notes: [],
        sort,
      };
      if (line.variantId) acc.variantId = line.variantId;
      combined.set(key, acc);
    }
    acc.totalQuantity += line.quantity;
    acc.lineTotal += line.priceSnapshot * line.quantity;
    const note = line.note?.trim();
    if (note) {
      acc.notes.push({
        participantName: names.get(line.participantId.toString()) ?? "Unknown",
        note,
      });
    }
  }

  const accs = [...combined.values()].sort((a, b) => {
    for (let i = 0; i < 4; i++) if (a.sort[i] !== b.sort[i]) return a.sort[i] - b.sort[i];
    return a.name.localeCompare(b.name);
  });

  const categories: RegroupedOrder["categories"] = [];
  for (const acc of accs) {
    const { sort: _sort, ...line } = acc;
    void _sort;
    let cat = categories.find((c) => c.id === line.categoryId);
    if (!cat) {
      cat = {
        id: line.categoryId,
        name: categoryOrder.get(line.categoryId)?.name ?? "Other",
        lines: [],
      };
      categories.push(cat);
    }
    cat.lines.push(line);
  }

  const subtotal = accs.reduce((s, l) => s + l.lineTotal, 0);
  const receipts = calculateReceipts(order, lines, people);
  const grandTotal = receipts.reduce((s, r) => s + r.total, 0);
  const fees = receipts.reduce((s, r) => s + (r.fee ?? 0), 0);
  return { categories, subtotal, multiplier: order.multiplier, fees, grandTotal };
}

/** Plain text for WhatsApp ("*bold*" category headers, notes indented). */
export function regroupedToText(
  restaurant: Pick<RestaurantDoc, "name">,
  regrouped: RegroupedOrder,
): string {
  const out: string[] = [`Order – ${restaurant.name}`];
  let itemCount = 0;
  for (const cat of regrouped.categories) {
    out.push("", `*${cat.name}*`);
    for (const line of cat.lines) {
      itemCount += line.totalQuantity;
      out.push(`${line.totalQuantity} × ${line.name}`);
      for (const n of line.notes) out.push(`    - ${n.participantName}: ${n.note}`);
    }
  }
  if (regrouped.categories.length === 0) out.push("", "(no items)");
  out.push(
    "",
    `Items: ${itemCount}`,
    `Subtotal: ${formatEGP(regrouped.subtotal)}`,
    // Sent to the restaurant, so the organiser's per-person fee is left out.
    regrouped.multiplier === 1
      ? `Total: ${formatEGP(regrouped.grandTotal - regrouped.fees)}`
      : `Total (×${regrouped.multiplier}): ${formatEGP(regrouped.grandTotal - regrouped.fees)}`,
  );
  return out.join("\n");
}
