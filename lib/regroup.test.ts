import { describe, expect, it } from "vitest";
import type { RestaurantDoc } from "@/lib/types";
import { regroupOrder, regroupedToText } from "./regroup";
import { line, order, person } from "./test-fixtures";

const restaurant = {
  name: "Burger Spot",
  menu: {
    categories: [
      {
        id: "burgers",
        name: "Burgers",
        items: [
          {
            id: "classic",
            name: "Classic Burger",
            price: 15000,
            variants: [
              { id: "single", name: "Single", price: 15000 },
              { id: "double", name: "Double", price: 21000 },
            ],
          },
        ],
      },
      {
        id: "sides",
        name: "Sides",
        items: [
          { id: "fries", name: "Fries", price: 4000 },
          { id: "rings", name: "Onion Rings", price: 5000 },
        ],
      },
    ],
  },
} satisfies Pick<RestaurantDoc, "name" | "menu">;

describe("regroupOrder", () => {
  const o = order(1.14);
  const ahmed = person("Ahmed");
  const sara = person("Sara");
  const omar = person("Omar");
  const dbl = { itemId: "classic", variantId: "double", name: "Classic Burger – Double", category: "burgers", price: 21000 };
  const lines = [
    line(ahmed, o, { itemId: "rings", name: "Onion Rings", category: "sides", price: 5000 }),
    line(ahmed, o, { ...dbl, quantity: 1, note: "no onions" }),
    line(sara, o, { ...dbl, quantity: 2 }),
    line(omar, o, { ...dbl, quantity: 1, note: "extra cheese" }),
    line(omar, o, { itemId: "fries", name: "Fries", category: "sides", price: 4000, quantity: 3 }),
    line(sara, o, { itemId: "classic", variantId: "single", name: "Classic Burger – Single", category: "burgers", price: 15000 }),
  ];
  const people = [ahmed, sara, omar];
  const regrouped = regroupOrder(o, restaurant, lines, people);

  it("combines identical item + variant lines", () => {
    const burgers = regrouped.categories[0];
    expect(burgers.name).toBe("Burgers");
    const double = burgers.lines.find((l) => l.variantId === "double")!;
    expect(double.totalQuantity).toBe(4);
    expect(double.unitPrice).toBe(21000);
    expect(double.lineTotal).toBe(84000);
    expect(double.notes).toEqual([
      { participantName: "Ahmed", note: "no onions" },
      { participantName: "Omar", note: "extra cheese" },
    ]);
  });

  it("orders categories, items and variants by the menu", () => {
    expect(regrouped.categories.map((c) => c.id)).toEqual(["burgers", "sides"]);
    expect(regrouped.categories[0].lines.map((l) => l.variantId)).toEqual(["single", "double"]);
    expect(regrouped.categories[1].lines.map((l) => l.itemId)).toEqual(["fries", "rings"]);
  });

  it("computes subtotal and grand total from rounded receipts", () => {
    // Ahmed 260 -> 296.4 -> 297; Sara 570 -> 649.8 -> 650; Omar 330 -> 376.2 -> 377
    expect(regrouped.subtotal).toBe(116000);
    expect(regrouped.grandTotal).toBe(29700 + 65000 + 37700);
    expect(regrouped.multiplier).toBe(1.14);
  });

  it("puts items no longer on the menu under Other", () => {
    const r = regroupOrder(
      o,
      restaurant,
      [line(ahmed, o, { itemId: "gone", name: "Old Item", category: "deleted-cat", price: 1000 })],
      people,
    );
    expect(r.categories).toEqual([
      expect.objectContaining({ id: "__other__", name: "Other" }),
    ]);
  });

  it("produces WhatsApp-ready text", () => {
    const text = regroupedToText(restaurant, regrouped);
    expect(text).toBe(
      [
        "Order – Burger Spot",
        "",
        "*Burgers*",
        "1 × Classic Burger – Single",
        "4 × Classic Burger – Double",
        "    - Ahmed: no onions",
        "    - Omar: extra cheese",
        "",
        "*Sides*",
        "3 × Fries",
        "1 × Onion Rings",
        "",
        "Items: 9",
        "Subtotal: 1,160 EGP",
        "Total (×1.14): 1,324 EGP",
      ].join("\n"),
    );
  });
});
