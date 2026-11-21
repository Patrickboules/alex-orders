"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Price, itemFromPrice } from "@/components/menu/price";
import { PaymentChoice } from "@/components/order/payment-choice";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Sheet } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import type { CartLineView, Menu, PaymentInfo, Receipt } from "@/components/view-types";
import { addLineAction, removeLineAction, updateLineAction } from "@/lib/actions/participant";
import { formatEGP } from "@/lib/money";
import type { MenuItem } from "@/lib/types";

const MAX_QTY = 20;
const MAX_NOTE = 140;

type CartOp =
  | { type: "add"; line: CartLineView }
  | { type: "update"; id: string; quantity?: number; note?: string }
  | { type: "remove"; id: string };

function reduceCart(lines: CartLineView[], op: CartOp): CartLineView[] {
  switch (op.type) {
    case "add":
      return [...lines, op.line];
    case "update":
      return lines.map((l) =>
        l.id === op.id
          ? { ...l, quantity: op.quantity ?? l.quantity, note: op.note !== undefined ? op.note : l.note }
          : l,
      );
    case "remove":
      return lines.filter((l) => l.id !== op.id);
  }
}

export function OrderMenu({
  shortCode,
  menu,
  lines,
  receipt,
  payment,
}: {
  shortCode: string;
  menu: Menu;
  lines: CartLineView[];
  receipt: Receipt | null;
  payment: PaymentInfo;
}) {
  const router = useRouter();
  const [optimisticLines, applyOp] = useOptimistic(lines, reduceCart);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const categories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        items: q ? c.items.filter((i) => i.name.toLowerCase().includes(q)) : c.items,
      }))
      .filter((c) => c.items.length > 0);
  }, [menu, query]);

  const countByItem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of optimisticLines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.quantity);
    return m;
  }, [optimisticLines]);

  const itemCount = optimisticLines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = optimisticLines.reduce((n, l) => n + l.quantity * l.unitPrice, 0);

  function run(op: CartOp, call: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      applyOp(op);
      const res = await call();
      if (!res.ok) setError(res.error ?? "Could not save. Try again.");
      router.refresh();
    });
  }

  function add(item: MenuItem, variantId: string | undefined, quantity: number, note: string) {
    const variant = item.variants?.find((v) => v.id === variantId);
    const line: CartLineView = {
      id: `pending-${Date.now()}`,
      itemId: item.id,
      variantId,
      name: variant ? `${item.name} – ${variant.name}` : item.name,
      quantity,
      unitPrice: variant ? variant.price : item.price,
      note: note || undefined,
    };
    setSelected(null);
    run({ type: "add", line }, () =>
      addLineAction({ shortCode, itemId: item.id, variantId, quantity, note: note || undefined }),
    );
  }

  function update(id: string, patch: { quantity?: number; note?: string }) {
    run({ type: "update", id, ...patch }, () => updateLineAction(id, patch));
  }

  function remove(id: string) {
    run({ type: "remove", id }, () => removeLineAction(id));
  }

  return (
    <>
      <MenuNav categories={categories.map((c) => ({ id: c.id, name: c.name }))} query={query} onQuery={setQuery} />

      {error ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger-wash px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-6 space-y-10">
        {categories.length === 0 ? (
          <p className="py-10 text-center text-ink-2">
            {query ? `Nothing on the menu matches “${query}”.` : "This menu has no items yet."}
          </p>
        ) : (
          categories.map((cat) => (
            <section key={cat.id} id={`cat-${cat.id}`} data-category={cat.id} aria-labelledby={`cat-h-${cat.id}`}>
              <h2 id={`cat-h-${cat.id}`} className="border-b border-ink pb-2 text-lg font-semibold" dir="auto">
                {cat.name}
              </h2>
              <ul className="divide-y divide-line">
                {cat.items.map((item) => {
                  const { price, varies } = itemFromPrice(item);
                  const inCart = countByItem.get(item.id) ?? 0;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(item)}
                        className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-start justify-between gap-4 rounded-[var(--radius-control)] px-2 py-3.5 text-start transition-colors duration-150 hover:bg-wash"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium" dir="auto">
                            {item.name}
                          </span>
                          {item.description ? (
                            <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2" dir="auto">
                              {item.description}
                            </span>
                          ) : null}
                          {inCart > 0 ? (
                            <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                              <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                              {inCart} in your order
                            </span>
                          ) : null}
                        </span>
                        <span className="shrink-0 pt-0.5 text-sm">
                          {varies ? <span className="text-ink-3">from </span> : null}
                          <Price value={price} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      {/* Room for the sticky bar. */}
      <div className="h-24" aria-hidden="true" />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className={cn(
              "flex min-h-13 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-4 font-medium transition-colors duration-150",
              itemCount > 0 ? "bg-ink text-paper hover:bg-ink/90" : "border border-line-strong text-ink-2 hover:bg-wash",
            )}
          >
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  "num grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold",
                  itemCount > 0 ? "bg-paper text-ink" : "bg-wash-2 text-ink-2",
                )}
              >
                {itemCount}
              </span>
              {itemCount > 0 ? "View your order" : "Your order is empty"}
            </span>
            <span className="num">{formatEGP(subtotal)}</span>
          </button>
        </div>
      </div>

      <ItemSheet item={selected} onClose={() => setSelected(null)} onAdd={add} />

      <CartSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        lines={optimisticLines}
        subtotal={subtotal}
        receipt={receipt}
        shortCode={shortCode}
        payment={payment}
        onUpdate={update}
        onRemove={remove}
        error={error}
      />
    </>
  );
}

/* ---------------- Sticky search + category bar ---------------- */

function MenuNav({
  categories,
  query,
  onQuery,
}: {
  categories: { id: string; name: string }[];
  query: string;
  onQuery: (q: string) => void;
}) {
  const [active, setActive] = useState<string | null>(categories[0]?.id ?? null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-category]"));
    if (sections.length === 0) return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set((e.target as HTMLElement).dataset.category!, e.isIntersecting);
        const first = sections.find((s) => visible.get(s.dataset.category!));
        if (first) setActive(first.dataset.category!);
      },
      { rootMargin: "-120px 0px -55% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [categories]);

  // Keep the active chip in view as the page scrolls. Scrolls only the chip bar:
  // scrollIntoView would also move the page and fight the user's finger.
  useEffect(() => {
    const bar = barRef.current;
    if (!active || !bar) return;
    const chip = bar.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    if (!chip) return;
    const barRect = bar.getBoundingClientRect();
    const chipRect = chip.getBoundingClientRect();
    const offset = chipRect.left - barRect.left - (barRect.width - chipRect.width) / 2;
    bar.scrollBy({ left: offset, behavior: "smooth" });
  }, [active]);

  function jump(id: string) {
    setActive(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper/95 px-4 pt-3 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <label htmlFor="menu-search" className="sr-only">
        Search the menu
      </label>
      <div className="relative">
        <svg viewBox="0 0 16 16" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id="menu-search"
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search the menu"
          dir="auto"
          autoComplete="off"
          className="min-h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-paper ps-9 pe-3 text-base placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
      </div>
      {categories.length > 1 ? (
        <nav aria-label="Menu sections">
          <div ref={barRef} className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-2.5">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                data-chip={c.id}
                onClick={() => jump(c.id)}
                aria-current={active === c.id ? "true" : undefined}
                className={cn(
                  "min-h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
                  active === c.id ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-2 hover:text-ink",
                )}
                dir="auto"
              >
                {c.name}
              </button>
            ))}
          </div>
        </nav>
      ) : (
        <div className="h-3" />
      )}
    </div>
  );
}

/* ---------------- Item sheet ---------------- */

function QtyStepper({
  value,
  onChange,
  label,
  size = "md",
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  size?: "md" | "sm";
  disabled?: boolean;
}) {
  const box = size === "md" ? "size-11" : "size-10";
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-[var(--radius-control)] border border-line-strong">
      <button
        type="button"
        className={cn(box, "grid place-items-center rounded-s-[var(--radius-control)] text-lg hover:bg-wash disabled:text-ink-3 disabled:hover:bg-transparent")}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <span className="num min-w-8 text-center font-semibold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={cn(box, "grid place-items-center rounded-e-[var(--radius-control)] text-lg hover:bg-wash disabled:text-ink-3 disabled:hover:bg-transparent")}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= MAX_QTY}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}

function ItemSheet({
  item,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, variantId: string | undefined, quantity: number, note: string) => void;
}) {
  // Remount the form for every item so its state starts fresh.
  return (
    <Sheet open={item !== null} onClose={onClose} title={item?.name ?? ""} description={item?.description}>
      {item ? <ItemForm key={item.id} item={item} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function ItemForm({
  item,
  onAdd,
}: {
  item: MenuItem;
  onAdd: (item: MenuItem, variantId: string | undefined, quantity: number, note: string) => void;
}) {
  const variants = item.variants ?? [];
  const [variantId, setVariantId] = useState<string | undefined>(variants[0]?.id);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const unit = variants.find((v) => v.id === variantId)?.price ?? item.price;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(item, variantId, qty, note.trim());
      }}
      className="space-y-6 pt-1"
    >
      {variants.length > 0 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Choose one</legend>
          <div className="divide-y divide-line rounded-[var(--radius-box)] border border-line">
            {variants.map((v) => (
              <label key={v.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2.5 has-[:checked]:bg-wash">
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={variantId === v.id}
                  onChange={() => setVariantId(v.id)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="flex-1" dir="auto">
                  {v.name}
                </span>
                <Price value={v.price} className="text-sm" />
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">Quantity</span>
        <QtyStepper value={qty} onChange={(n) => setQty(Math.min(MAX_QTY, Math.max(1, n)))} label="Quantity" />
      </div>

      <div>
        <label htmlFor="item-note" className="mb-1.5 flex justify-between text-sm font-medium">
          <span>Note</span>
          <span className="num font-normal text-ink-3">
            {note.length}/{MAX_NOTE}
          </span>
        </label>
        <Textarea
          id="item-note"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
          maxLength={MAX_NOTE}
          rows={2}
          dir="auto"
          placeholder="Optional, e.g. no onions"
        />
      </div>

      <Button type="submit" size="lg" className="w-full justify-between">
        <span>Add to order</span>
        <span className="num">{formatEGP(unit * qty)}</span>
      </Button>
    </form>
  );
}

/* ---------------- Cart sheet ---------------- */

function CartSheet({
  open,
  onClose,
  lines,
  subtotal,
  receipt,
  shortCode,
  payment,
  onUpdate,
  onRemove,
  error,
}: {
  open: boolean;
  onClose: () => void;
  lines: CartLineView[];
  subtotal: number;
  receipt: Receipt | null;
  shortCode: string;
  payment: PaymentInfo;
  onUpdate: (id: string, patch: { quantity?: number; note?: string }) => void;
  onRemove: (id: string) => void;
  error: string | null;
}) {
  // The server receipt can lag a moment behind optimistic edits; only show its
  // totals when it matches what is on screen.
  const receiptInSync = receipt && receipt.subtotal === subtotal;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your order"
      description={lines.length > 0 ? "Changes save as you make them." : undefined}
      footer={
        lines.length > 0 ? (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Subtotal</span>
              <span className="num">{formatEGP(subtotal)}</span>
            </div>
            {receiptInSync ? (
              <>
                {receipt.multiplier !== 1 ? (
                  <div className="flex justify-between">
                    <span className="text-ink-2">Tax &amp; service (×{receipt.multiplier.toFixed(2)})</span>
                    <span className="num">{formatEGP(receipt.total - receipt.subtotal)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between pt-1 text-base font-semibold">
                  <span>Estimated total</span>
                  <span className="num text-lg">{formatEGP(receipt.total)}</span>
                </div>
              </>
            ) : (
              <p className="pt-1 text-ink-3">Updating total…</p>
            )}
            <p className="pt-1 text-xs text-ink-2">Estimate – final after order closes</p>
          </div>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="mb-3 rounded-[var(--radius-control)] bg-danger-wash px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {lines.length === 0 ? (
        <div className="py-10 text-center">
          <p className="font-medium">Your cart is empty</p>
          <p className="mt-1 text-sm text-ink-2">Tap any item on the menu to add it.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <CartRow key={line.id} line={line} onUpdate={onUpdate} onRemove={onRemove} />
            ))}
          </ul>
          {receipt ? (
            <div className="mt-4 border-t border-line pt-5 pb-2">
              <PaymentChoice
                key={receipt.paymentChoice ?? "none"}
                shortCode={shortCode}
                total={receiptInSync ? formatEGP(receipt.total) : "…"}
                payment={payment}
                initialChoice={receipt.paymentChoice}
              />
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function CartRow({
  line,
  onUpdate,
  onRemove,
}: {
  line: CartLineView;
  onUpdate: (id: string, patch: { quantity?: number; note?: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(line.note ?? "");
  const pending = line.id.startsWith("pending-");

  return (
    <li className={cn("py-4", pending && "opacity-60")}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-medium" dir="auto">
          {line.name}
        </p>
        <Price value={line.unitPrice * line.quantity} className="shrink-0 text-sm" />
      </div>
      {line.note && !editingNote ? (
        <p className="mt-0.5 text-sm text-ink-2" dir="auto">
          {line.note}
        </p>
      ) : null}

      {editingNote ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onUpdate(line.id, { note: note.trim() });
            setEditingNote(false);
          }}
        >
          <label htmlFor={`note-${line.id}`} className="sr-only">
            Note for {line.name}
          </label>
          <Textarea
            id={`note-${line.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE))}
            maxLength={MAX_NOTE}
            rows={2}
            dir="auto"
            placeholder="e.g. no onions"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNote(line.note ?? "");
                setEditingNote(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save note
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <QtyStepper
          size="sm"
          disabled={pending}
          value={line.quantity}
          onChange={(n) => onUpdate(line.id, { quantity: Math.min(MAX_QTY, Math.max(1, n)) })}
          label={`Quantity of ${line.name}`}
        />
        <div className="flex gap-1">
          {!editingNote ? (
            <Button variant="ghost" size="md" disabled={pending} onClick={() => setEditingNote(true)}>
              {line.note ? "Edit note" : "Add note"}
            </Button>
          ) : null}
          <Button variant="ghost" size="md" className="text-danger hover:bg-danger-wash" disabled={pending} onClick={() => onRemove(line.id)}>
            Remove
          </Button>
        </div>
      </div>
    </li>
  );
}
