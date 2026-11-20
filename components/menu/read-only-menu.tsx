import type { Menu } from "@/lib/types";
import { Price, itemFromPrice } from "./price";

/** The menu as a plain list, grouped by category. */
export function ReadOnlyMenu({ menu }: { menu: Menu }) {
  const categories = menu.categories.filter((c) => c.items.length > 0);
  if (categories.length === 0) {
    return <p className="text-ink-2">This menu has no items yet.</p>;
  }
  return (
    <div className="space-y-10">
      {categories.map((cat) => (
        <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
          <h2 id={`cat-${cat.id}`} className="border-b border-ink pb-2 text-lg font-semibold" dir="auto">
            {cat.name}
          </h2>
          <ul className="divide-y divide-line">
            {cat.items.map((item) => {
              const { price, varies } = itemFromPrice(item);
              return (
                <li key={item.id} className="flex items-baseline justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium" dir="auto">
                      {item.name}
                    </p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-ink-2" dir="auto">
                        {item.description}
                      </p>
                    ) : null}
                    {item.variants && item.variants.length > 0 ? (
                      <p className="mt-1 text-sm text-ink-2" dir="auto">
                        {item.variants.map((v, i) => (
                          <span key={v.id}>
                            {i > 0 ? ", " : ""}
                            {v.name} <Price value={v.price} />
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm">
                    {varies ? <span className="text-ink-3">from </span> : null}
                    <Price value={price} />
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
