// Single source of truth for what each participant owes (FR-19).
// Pure functions: no DB, no Next.js imports, safe to unit test.

import type {
  GroupOrderDoc,
  OrderLineDoc,
  ParticipantDoc,
  Receipt,
  ReceiptLine,
} from "@/lib/types";
import { applyMultiplier } from "@/lib/money";

type OrderForReceipt = Pick<GroupOrderDoc, "multiplier" | "payments" | "paymentChoices" | "perPersonFee">;
type LineForReceipt = Pick<
  OrderLineDoc,
  "_id" | "participantId" | "nameSnapshot" | "priceSnapshot" | "quantity" | "note"
> &
  Partial<Pick<OrderLineDoc, "createdAt">>;
type PersonForReceipt = Pick<ParticipantDoc, "_id" | "name" | "phone">;

/** Receipt for one participant from their own lines (works with zero lines: total 0). */
export function calculateReceipt(
  order: OrderForReceipt,
  linesOfOne: LineForReceipt[],
  person: PersonForReceipt,
): Receipt {
  const lines: ReceiptLine[] = linesOfOne
    .filter((l) => l.quantity > 0)
    .map((l) => {
      const line: ReceiptLine = {
        lineId: l._id.toString(),
        name: l.nameSnapshot,
        quantity: l.quantity,
        unitPrice: l.priceSnapshot,
        lineTotal: l.priceSnapshot * l.quantity,
      };
      if (l.note) line.note = l.note;
      return line;
    });

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const fee = lines.length > 0 ? (order.perPersonFee ?? 0) : 0;
  const total = applyMultiplier(subtotal, order.multiplier) + fee;
  const pid = person._id.toString();
  const payment = (order.payments ?? []).find((p) => p.participantId.toString() === pid);

  const receipt: Receipt = {
    participantId: pid,
    participantName: person.name,
    participantPhone: person.phone,
    lines,
    subtotal,
    multiplier: order.multiplier,
    total,
    paid: Boolean(payment),
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
    const key = line.participantId.toString();
    const list = byPerson.get(key);
    if (list) list.push(line);
    else byPerson.set(key, [line]);
  }

  const peopleById = new Map(people.map((p) => [p._id.toString(), p]));
  const firstAt = (ls: LineForReceipt[]) =>
    Math.min(...ls.map((l) => (l.createdAt ? new Date(l.createdAt).getTime() : 0)));

  return [...byPerson.entries()]
    .sort((a, b) => firstAt(a[1]) - firstAt(b[1]))
    .map(([pid, ls]) => {
      const person: PersonForReceipt = peopleById.get(pid) ?? {
        _id: ls[0].participantId,
        name: "Unknown",
        phone: "",
      };
      return calculateReceipt(order, ls, person);
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
