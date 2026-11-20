import { describe, expect, it } from "vitest";
import { calculateReceipt, calculateReceipts, summarizePayments } from "./receipts";
import { line, order, person } from "./test-fixtures";

describe("calculateReceipts", () => {
  it("worked example at 1.14: 100 -> 114 EGP, 200 -> 228 EGP", () => {
    const o = order(1.14);
    const a = person("A");
    const b = person("B");
    const receipts = calculateReceipts(
      o,
      [line(a, o, { price: 10000 }), line(b, o, { price: 5000, quantity: 4 })],
      [a, b],
    );
    expect(receipts.map((r) => [r.participantName, r.subtotal, r.total])).toEqual([
      ["A", 10000, 11400],
      ["B", 20000, 22800],
    ]);
  });

  it("multiplier 1.26: 100 -> 126 EGP", () => {
    const o = order(1.26);
    const a = person("A");
    const [r] = calculateReceipts(o, [line(a, o, { price: 10000 })], [a]);
    expect(r.total).toBe(12600);
    expect(r.multiplier).toBe(1.26);
  });

  it("rounds up: 37.50 @1.14 = 42.75 -> 43 EGP", () => {
    const o = order(1.14);
    const a = person("A");
    const [r] = calculateReceipts(
      o,
      [line(a, o, { price: 2500 }), line(a, o, { price: 1250 })],
      [a],
    );
    expect(r.subtotal).toBe(3750);
    expect(r.total).toBe(4300);
  });

  it("excludes participants with zero lines", () => {
    const o = order(1.14);
    const a = person("A");
    const idle = person("Idle");
    const receipts = calculateReceipts(o, [line(a, o, { price: 10000 })], [a, idle]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].participantName).toBe("A");
  });

  it("single participant with several lines and quantities", () => {
    const o = order(1.14);
    const a = person("Ahmed", "01012345678");
    const receipts = calculateReceipts(
      o,
      [
        line(a, o, { name: "Burger", price: 15000, quantity: 2, note: "no onions" }),
        line(a, o, { name: "Fries", price: 4000 }),
      ],
      [a],
    );
    expect(receipts).toHaveLength(1);
    const r = receipts[0];
    expect(r.participantPhone).toBe("01012345678");
    expect(r.lines.map((l) => [l.name, l.quantity, l.unitPrice, l.lineTotal, l.note])).toEqual([
      ["Burger", 2, 15000, 30000, "no onions"],
      ["Fries", 1, 4000, 4000, undefined],
    ]);
    expect(r.subtotal).toBe(34000);
    expect(r.total).toBe(38800); // 340 × 1.14 = 387.6 -> 388
    expect(r.paid).toBe(false);
  });

  it("flags amountChangedSincePayment when the total moved", () => {
    const a = person("A");
    const b = person("B");
    const o = order(1.26, [
      { participantId: a._id, paidAt: new Date(), paidMethod: "cash", amountAtPayment: 11400 },
      { participantId: b._id, paidAt: new Date(), paidMethod: "instapay", amountAtPayment: 12600 },
    ]);
    const receipts = calculateReceipts(
      o,
      [line(a, o, { price: 10000 }), line(b, o, { price: 10000 })],
      [a, b],
    );
    expect(receipts[0]).toMatchObject({ paid: true, paidMethod: "cash", amountChangedSincePayment: true });
    expect(receipts[1]).toMatchObject({ paid: true, paidMethod: "instapay", amountChangedSincePayment: false });
    expect(summarizePayments(receipts)).toEqual({
      paidCount: 2,
      participantCount: 2,
      collected: 25200,
      outstanding: 0,
      grandTotal: 25200,
    });
  });

  it("calculateReceipt with no lines owes 0", () => {
    const r = calculateReceipt(order(1.14), [], person("A"));
    expect(r.total).toBe(0);
    expect(r.lines).toEqual([]);
  });
});
