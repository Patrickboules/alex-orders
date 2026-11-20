"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { ConfirmDialog } from "@/components/ui/dialog";
import { publishMenuAction, saveMenuEditsAction } from "@/lib/actions/restaurants";
import type { Menu, MenuCategory, MenuItem, MenuStatus, MenuVariant, SourceFile } from "@/lib/types";

function newId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  } catch {
    return Math.random().toString(36).slice(2, 14);
  }
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Item price = first variant's price when it has variants; trims names. */
function normalize(menu: Menu): Menu {
  return {
    categories: menu.categories.map((c) => ({
      ...c,
      name: c.name.trim(),
      items: c.items.map((i) => {
        const variants = (i.variants ?? []).map((v) => ({ ...v, name: v.name.trim() }));
        const description = i.description?.trim();
        return {
          id: i.id,
          name: i.name.trim(),
          ...(description ? { description } : {}),
          price: variants.length > 0 ? variants[0].price : i.price,
          ...(variants.length > 0 ? { variants } : {}),
        };
      }),
    })),
  };
}

type Problems = { missingPrice: Set<string>; missingName: Set<string>; itemCount: number };

function findProblems(menu: Menu): Problems {
  const missingPrice = new Set<string>();
  const missingName = new Set<string>();
  let itemCount = 0;
  for (const c of menu.categories) {
    if (!c.name.trim()) missingName.add(c.id);
    for (const i of c.items) {
      itemCount++;
      if (!i.name.trim()) missingName.add(i.id);
      const vs = i.variants ?? [];
      if (vs.length === 0) {
        if (!(i.price > 0)) missingPrice.add(i.id);
      } else {
        for (const v of vs) {
          if (!(v.price > 0)) missingPrice.add(v.id);
          if (!v.name.trim()) missingName.add(v.id);
        }
      }
    }
  }
  return { missingPrice, missingName, itemCount };
}

type Confirm = { title: string; body: string; label: string; run: () => void } | null;

export function MenuEditor({
  restaurantId,
  initialMenu,
  menuStatus,
  sourceFiles,
  onReupload,
  notice,
  onNotice,
}: {
  restaurantId: string;
  initialMenu: Menu;
  menuStatus: MenuStatus;
  sourceFiles: SourceFile[];
  onReupload: () => void;
  /** Survives the remount that follows a save. */
  notice: string | null;
  onNotice: (text: string | null) => void;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<Menu>(initialMenu);
  const [dirty, setDirty] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [parseWarning, setParseWarning] = useState<number[]>([]);

  useEffect(() => {
    try {
      const key = `parse-warning-${restaurantId}`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser storage after mount
        setParseWarning((JSON.parse(raw) as { page: number }[]).map((p) => p.page));
        sessionStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable: nothing to show.
    }
  }, [restaurantId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const problems = useMemo(() => findProblems(menu), [menu]);
  const priceCount = problems.missingPrice.size;
  const valid = priceCount === 0 && problems.missingName.size === 0 && problems.itemCount > 0;

  function edit(fn: (m: Menu) => Menu) {
    setMenu((m) => fn(m));
    setDirty(true);
    setMessage(null);
    onNotice(null);
  }

  const setCategory = (ci: number, fn: (c: MenuCategory) => MenuCategory) =>
    edit((m) => ({ categories: m.categories.map((c, i) => (i === ci ? fn(c) : c)) }));
  const setItem = (ci: number, ii: number, fn: (it: MenuItem) => MenuItem) =>
    setCategory(ci, (c) => ({ ...c, items: c.items.map((it, j) => (j === ii ? fn(it) : it)) }));

  function save() {
    startSave(async () => {
      const res = await saveMenuEditsAction(restaurantId, normalize(menu));
      if (res.ok) {
        setDirty(false);
        onNotice("Draft saved");
        router.refresh();
      } else setMessage({ tone: "error", text: res.error });
    });
  }

  function publish() {
    startPublish(async () => {
      const res = await publishMenuAction(restaurantId, normalize(menu));
      if (res.ok) {
        setDirty(false);
        onNotice(menuStatus === "published" ? "Changes published" : "Menu published");
        router.refresh();
      } else setMessage({ tone: "error", text: res.error });
    });
  }

  function jumpToFirstProblem() {
    const id = [...problems.missingPrice][0] ?? [...problems.missingName][0];
    const el = id ? document.querySelector<HTMLInputElement>(`[data-field-for="${id}"]`) : null;
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <SourcePanel files={sourceFiles} onReupload={() =>
        setConfirm({
          title: "Replace this menu?",
          body: "Uploading again replaces the draft with a new reading. Edits you haven’t published will be lost.",
          label: "Re-upload",
          run: onReupload,
        })
      } />

      <div className="min-w-0">
        {parseWarning.length > 0 ? (
          <p className="mb-4 rounded-[var(--radius-control)] bg-warn-wash px-3 py-2.5 text-sm text-warn">
            Couldn’t read {parseWarning.map((p) => `page ${p}`).join(", ")}. Check the photos and add anything missing by hand.
          </p>
        ) : null}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2">
            <span className="num">{problems.itemCount}</span> items in{" "}
            <span className="num">{menu.categories.length}</span> sections
          </p>
          {priceCount > 0 || problems.missingName.size > 0 ? (
            <button
              type="button"
              onClick={jumpToFirstProblem}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-warn-wash px-3 text-sm font-medium text-warn"
            >
              {priceCount > 0
                ? `${priceCount} ${priceCount === 1 ? "price is" : "prices are"} missing`
                : `${problems.missingName.size} ${problems.missingName.size === 1 ? "name is" : "names are"} empty`}
              <span className="underline underline-offset-4">Show</span>
            </button>
          ) : null}
        </div>

        <ol className="space-y-6">
          {menu.categories.map((cat, ci) => (
            <li key={cat.id} className="rounded-[var(--radius-box)] border border-line">
              <div className="flex items-center gap-2 border-b border-line bg-wash px-3 py-2">
                <label className="sr-only" htmlFor={`c-${cat.id}`}>
                  Section name
                </label>
                <input
                  id={`c-${cat.id}`}
                  data-field-for={cat.id}
                  value={cat.name}
                  onChange={(e) => setCategory(ci, (c) => ({ ...c, name: e.target.value }))}
                  dir="auto"
                  placeholder="Section name"
                  aria-invalid={problems.missingName.has(cat.id) || undefined}
                  className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 font-semibold hover:border-line-strong focus:border-accent focus:bg-paper focus:outline-none aria-[invalid=true]:border-warn"
                />
                <Reorder
                  label={`section ${cat.name}`}
                  first={ci === 0}
                  last={ci === menu.categories.length - 1}
                  onUp={() => edit((m) => ({ categories: move(m.categories, ci, ci - 1) }))}
                  onDown={() => edit((m) => ({ categories: move(m.categories, ci, ci + 1) }))}
                />
                <IconButton
                  label={`Delete section ${cat.name}`}
                  onClick={() => {
                    const remove = () => edit((m) => ({ categories: m.categories.filter((_, i) => i !== ci) }));
                    if (cat.items.length === 0) remove();
                    else
                      setConfirm({
                        title: `Delete “${cat.name || "this section"}”?`,
                        body: `Its ${cat.items.length} ${cat.items.length === 1 ? "item" : "items"} will be removed too.`,
                        label: "Delete section",
                        run: remove,
                      });
                  }}
                >
                  <TrashIcon />
                </IconButton>
              </div>

              <ul className="divide-y divide-line">
                {cat.items.map((item, ii) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    problems={problems}
                    first={ii === 0}
                    last={ii === cat.items.length - 1}
                    onChange={(fn) => setItem(ci, ii, fn)}
                    onUp={() => setCategory(ci, (c) => ({ ...c, items: move(c.items, ii, ii - 1) }))}
                    onDown={() => setCategory(ci, (c) => ({ ...c, items: move(c.items, ii, ii + 1) }))}
                    onDelete={() => setCategory(ci, (c) => ({ ...c, items: c.items.filter((_, j) => j !== ii) }))}
                  />
                ))}
              </ul>
              <div className="border-t border-line px-3 py-2">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() =>
                    setCategory(ci, (c) => ({ ...c, items: [...c.items, { id: newId(), name: "", price: 0 }] }))
                  }
                >
                  Add item
                </Button>
              </div>
            </li>
          ))}
        </ol>

        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => edit((m) => ({ categories: [...m.categories, { id: newId(), name: "", items: [] }] }))}
        >
          Add section
        </Button>

        {/* Sticky save bar */}
        <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-line bg-paper/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-t-[var(--radius-box)] sm:border-x">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className={cn("text-sm", message?.tone === "error" ? "text-danger" : message || notice ? "text-accent" : "text-ink-2")}>
              {message
                ? message.text
                : notice && !dirty
                  ? notice
                  : dirty
                  ? "Unsaved changes"
                  : menuStatus === "published"
                    ? "Published. Edits apply to new orders only."
                    : "Draft. Not visible to anyone yet."}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={save} pending={saving} disabled={!dirty || publishing}>
                Save draft
              </Button>
              <Button
                onClick={publish}
                pending={publishing}
                disabled={!valid || saving}
                aria-describedby={!valid ? "publish-why" : undefined}
              >
                {menuStatus === "published" ? "Publish changes" : "Publish menu"}
              </Button>
            </div>
          </div>
          {!valid ? (
            <p id="publish-why" className="mt-1 text-xs text-ink-2">
              {problems.itemCount === 0
                ? "Add at least one item to publish."
                : "Fill in every price and name to publish."}
            </p>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        confirmLabel={confirm?.label ?? "Confirm"}
        tone="danger"
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
      >
        {confirm?.body}
      </ConfirmDialog>
    </div>
  );
}

/* ---------------- One item ---------------- */

function ItemRow({
  item,
  problems,
  first,
  last,
  onChange,
  onUp,
  onDown,
  onDelete,
}: {
  item: MenuItem;
  problems: Problems;
  first: boolean;
  last: boolean;
  onChange: (fn: (it: MenuItem) => MenuItem) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}) {
  const variants = item.variants ?? [];
  const setVariant = (vi: number, fn: (v: MenuVariant) => MenuVariant) =>
    onChange((it) => ({ ...it, variants: (it.variants ?? []).map((v, j) => (j === vi ? fn(v) : v)) }));
  const flagged = problems.missingPrice.has(item.id) || variants.some((v) => problems.missingPrice.has(v.id));

  return (
    <li className={cn("px-3 py-3", flagged && "bg-warn-wash/60")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex gap-2">
            <TextField
              id={item.id}
              label="Item name"
              value={item.name}
              onChange={(name) => onChange((it) => ({ ...it, name }))}
              invalid={problems.missingName.has(item.id)}
              className="flex-1 font-medium"
              placeholder="Item name"
            />
            {variants.length === 0 ? (
              <PriceField
                id={item.id}
                label={`Price of ${item.name || "item"}`}
                value={item.price}
                onChange={(price) => onChange((it) => ({ ...it, price }))}
                invalid={problems.missingPrice.has(item.id)}
              />
            ) : null}
          </div>
          <TextField
            id={`${item.id}-d`}
            label="Description"
            value={item.description ?? ""}
            onChange={(description) => onChange((it) => ({ ...it, description }))}
            className="block w-full text-sm text-ink-2"
            placeholder="Description (optional)"
          />

          {variants.length > 0 ? (
            <ul className="space-y-2 border-s-2 border-line ps-3">
              {variants.map((v, vi) => (
                <li key={v.id} className="flex items-center gap-2">
                  <TextField
                    id={v.id}
                    label="Size or option"
                    value={v.name}
                    onChange={(name) => setVariant(vi, (x) => ({ ...x, name }))}
                    invalid={problems.missingName.has(v.id)}
                    className="flex-1 text-sm"
                    placeholder="e.g. Large"
                  />
                  <PriceField
                    id={v.id}
                    label={`Price of ${item.name} ${v.name}`}
                    value={v.price}
                    onChange={(price) => setVariant(vi, (x) => ({ ...x, price }))}
                    invalid={problems.missingPrice.has(v.id)}
                  />
                  <IconButton
                    label={`Remove option ${v.name}`}
                    onClick={() =>
                      onChange((it) => {
                        const rest = (it.variants ?? []).filter((_, j) => j !== vi);
                        return { ...it, price: rest.length === 0 ? (it.variants?.[vi]?.price ?? it.price) : it.price, variants: rest };
                      })
                    }
                  >
                    <CloseIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() =>
              onChange((it) => {
                const vs = it.variants ?? [];
                // The first option inherits the item's own price.
                const seed = vs.length === 0 ? [{ id: newId(), name: "Regular", price: it.price }] : [];
                return { ...it, variants: [...vs, ...seed, { id: newId(), name: "", price: 0 }] };
              })
            }
            className="-mx-1 flex min-h-9 items-center px-1 text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
          >
            Add size or option
          </button>
        </div>
        <div className="flex shrink-0 flex-col items-center">
          <Reorder label={`item ${item.name}`} first={first} last={last} onUp={onUp} onDown={onDown} vertical />
          <IconButton label={`Delete ${item.name || "item"}`} onClick={onDelete}>
            <TrashIcon />
          </IconButton>
        </div>
      </div>
    </li>
  );
}

/* ---------------- Small controls ---------------- */

function TextField({
  id,
  label,
  value,
  onChange,
  invalid,
  className,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <>
      <label htmlFor={`f-${id}`} className="sr-only">
        {label}
      </label>
      <input
        id={`f-${id}`}
        data-field-for={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="auto"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className={cn(
          "min-h-11 min-w-0 rounded-[var(--radius-control)] border border-line bg-paper px-2.5 placeholder:text-ink-3 hover:border-line-strong focus:border-accent focus:outline-none aria-[invalid=true]:border-warn",
          className,
        )}
      />
    </>
  );
}

/** Price typed in EGP, stored in piasters. Keeps the raw text while typing. */
function PriceField({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (piasters: number) => void;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value > 0 ? String(value / 100) : "");
  return (
    <div className="relative w-28 shrink-0">
      <label htmlFor={`p-${id}`} className="sr-only">
        {label}
      </label>
      <input
        id={`p-${id}`}
        data-field-for={id}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
          setText(raw);
          const n = Number.parseFloat(raw);
          onChange(Number.isFinite(n) ? Math.round(n * 100) : 0);
        }}
        placeholder="0"
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `p-${id}-err` : undefined}
        dir="ltr"
        className="num min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-paper ps-2.5 pe-11 text-end hover:border-line-strong focus:border-accent focus:outline-none aria-[invalid=true]:border-warn aria-[invalid=true]:bg-paper"
      />
      <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-3">EGP</span>
      {invalid ? (
        <span id={`p-${id}-err`} className="mt-0.5 block text-end text-xs font-medium text-warn">
          Add a price
        </span>
      ) : null}
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink-3 hover:bg-paper hover:text-danger"
    >
      {children}
    </button>
  );
}

function Reorder({
  label,
  first,
  last,
  onUp,
  onDown,
  vertical,
}: {
  label: string;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  vertical?: boolean;
}) {
  const btn =
    "grid size-11 place-items-center rounded-[var(--radius-control)] text-ink-3 hover:bg-paper hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className={cn("flex", vertical && "flex-col")}>
      <button type="button" className={btn} onClick={onUp} disabled={first} aria-label={`Move ${label} up`}>
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button type="button" className={btn} onClick={onDown} disabled={last} aria-label={`Move ${label} down`}>
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden="true">
      <path
        d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Original upload, shown beside the editor ---------------- */

function SourcePanel({ files, onReupload }: { files: SourceFile[]; onReupload: () => void }) {
  return (
    <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
      <details open className="group rounded-[var(--radius-box)] border border-line">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>Original menu</span>
          <span className="text-ink-3 group-open:hidden">Show</span>
          <span className="hidden text-ink-3 group-open:inline">Hide</span>
        </summary>
        <div className="space-y-3 border-t border-line p-3">
          {files.length === 0 ? (
            <p className="px-1 py-4 text-sm text-ink-2">No uploaded files are stored for this menu.</p>
          ) : (
            files.map((f, i) =>
              f.type === "image" ? (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[var(--radius-control)] border border-line">
                  {/* Uploaded source photos at their natural size, for reading. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Menu page ${i + 1}`} loading="lazy" className="w-full" />
                </a>
              ) : f.type === "pdf" ? (
                <div key={f.url} className="space-y-2">
                  <object data={f.url} type="application/pdf" className="hidden h-[70dvh] w-full rounded-[var(--radius-control)] border border-line lg:block">
                    <p className="p-3 text-sm">This browser can’t show PDFs inline.</p>
                  </object>
                  <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
                    Open the PDF
                  </a>
                </div>
              ) : (
                <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="block break-all rounded-[var(--radius-control)] bg-wash px-3 py-2.5 text-sm underline underline-offset-4" dir="ltr">
                  {f.url}
                </a>
              ),
            )
          )}
          <Button variant="secondary" className="w-full" onClick={onReupload}>
            Re-upload menu
          </Button>
        </div>
      </details>
    </aside>
  );
}
