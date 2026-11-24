// Single source of truth for what each participant owes (FR-19).
// Pure functions: no DB, no Next.js imports, safe to unit test.

import type {
  GroupOrderDoc,
  OrderLineDoc,
  ParticipantDoc,
  Receipt,
  ReceiptLine,
} from "@/lib/types";
import { ObjectId } from "mongodb";
import { applyMultiplier } from "@/lib/money";

type OrderForReceipt = Pick<
  GroupOrderDoc,
  "multiplier" | "payments" | "paymentChoices" | "perPersonFee" | "confirmations"
>;
type LineForReceipt = Pick<
  OrderLineDoc,
  "_id" | "participantId" | "nameSnapshot" | "priceSnapshot" | "quantity" | "note"
> &
  Partial<Pick<OrderLineDoc, "createdAt" | "sharedWith">>;

/** Everyone paying for a line: its owner first, then whoever it's shared with. */
function payersOf(line: LineForReceipt): string[] {
  const ids = [line.participantId.toString()];
  for (const id of line.sharedWith ?? []) {
    const s = id.toString();
    if (!ids.includes(s)) ids.push(s);
  }
  return ids;
}

/** Splits a line's full price into equal piaster shares; leftover piasters go to the first payers. */
export function shareOf(full: number, payers: number, index: number): number {
  return Math.floor(full / payers) + (index < full % payers ? 1 : 0);
}
type PersonForReceipt = Pick<ParticipantDoc, "_id" | "name" | "phone">;

/** Receipt for one participant from their own lines (works with zero lines: total 0). */
export function calculateReceipt(
  order: OrderForReceipt,
  linesOfOne: LineForReceipt[],
  person: PersonForReceipt,
  names?: Map<string, string>,
): Receipt {
  const pid = person._id.toString();
  const lines: ReceiptLine[] = [];
  let ownedFullSubtotal = 0;
  for (const l of linesOfOne) {
    if (l.quantity <= 0) continue;
    const payers = payersOf(l);
    const index = payers.indexOf(pid);
    if (index === -1) continue;
    const full = l.priceSnapshot * l.quantity;
    const isOwner = index === 0;
    if (isOwner) ownedFullSubtotal += full;
    const line: ReceiptLine = {
      lineId: l._id.toString(),
      name: l.nameSnapshot,
      quantity: l.quantity,
      unitPrice: l.priceSnapshot,
      lineTotal: shareOf(full, payers.length, index),
      isOwner,
    };
    if (l.note) line.note = l.note;
    if (payers.length > 1) {
      line.shareCount = payers.length;
      line.sharedWithIds = payers;
      line.sharedWithNames = payers.filter((id) => id !== pid).map((id) => names?.get(id) ?? "someone");
    }
    lines.push(line);
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const fee = lines.length > 0 ? (order.perPersonFee ?? 0) : 0;
  const total = applyMultiplier(subtotal, order.multiplier) + fee;
  const payment = (order.payments ?? []).find((p) => p.participantId.toString() === pid);

  const receipt: Receipt = {
    participantId: pid,
    participantName: person.name,
    participantPhone: person.phone,
    lines,
    subtotal,
    ownedFullSubtotal,
    multiplier: order.multiplier,
    total,
    paid: Boolean(payment),
    confirmed: (order.confirmations ?? []).some((c) => c.participantId.toString() === pid),
    amountChangedSincePayment: payment ? payment.amountAtPayment !== total : false,
  };
  if (fee > 0) receipt.fee = fee;
  if (payment) receipt.paidMethod = payment.paidMethod;
  const choice = (order.paymentChoices ?? []).find((c) => c.participantId.toString() === pid);
  if (choice) receipt.paymentChoice = choice.method;
  return receipt;
}

/**
 * One receipt per participant who has at least one line. Participants with zero
 * lines are excluded. Sorted by when each participant added their first line.
 */
export function calculateReceipts(
  order: OrderForReceipt,
  lines: LineForReceipt[],
  people: PersonForReceipt[],
): Receipt[] {
  const byPerson = new Map<string, LineForReceipt[]>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    for (const key of payersOf(line)) {
      const list = byPerson.get(key);
      if (list) list.push(line);
      else byPerson.set(key, [line]);
    }
  }

  const peopleById = new Map(people.map((p) => [p._id.toString(), p]));
  const names = new Map(people.map((p) => [p._id.toString(), p.name]));
  const firstAt = (ls: LineForReceipt[]) =>
    Math.min(...ls.map((l) => (l.createdAt ? new Date(l.createdAt).getTime() : 0)));

  return [...byPerson.entries()]
    .sort((a, b) => firstAt(a[1]) - firstAt(b[1]))
    .map(([pid, ls]) => {
      const person: PersonForReceipt = peopleById.get(pid) ?? {
        _id: new ObjectId(pid),
        name: "Unknown",
        phone: "",
      };
      return calculateReceipt(order, ls, person, names);
    });
}

/** Totals for the payments summary ("X of Y paid · collected · outstanding"). */
export function summarizePayments(receipts: Receipt[]): {
  paidCount: number;
  participantCount: number;
  collected: number;
  outstanding: number;
  grandTotal: number;
} {
  let paidCount = 0;
  let collected = 0;
  let outstanding = 0;
  for (const r of receipts) {
    if (r.paid) {
      paidCount++;
      collected += r.total;
    } else {
      outstanding += r.total;
    }
  }
  return {
    paidCount,
    participantCount: receipts.length,
    collected,
    outstanding,
    grandTotal: collected + outstanding,
  };
}
