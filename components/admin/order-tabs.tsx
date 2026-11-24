"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { ShareNote } from "@/components/order/share-note";
import { Segmented, TabPanel, Tabs, useTabsId } from "@/components/ui/tabs";
import {
  removeLineAdminAction,
  removeParticipantAdminAction,
  setLineSharingAction,
  setPaymentAction,
} from "@/lib/actions/groupOrders";
import { formatEGP } from "@/lib/money";
import type { PaymentMethod, Receipt, ReceiptLine, RegroupedOrder } from "@/lib/types";

type Tab = "participants" | "regrouped" | "people" | "payments";

const itemsOf = (r: Receipt) => r.lines.reduce((n, l) => n + l.quantity, 0);

function waLink(phone: string) {
  // 01XXXXXXXXX -> 201XXXXXXXXX
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.startsWith("0") ? `2${digits}` : digits}`;
}

export function OrderTabs({
  orderId,
  receipts,
  regrouped,
  regroupedText,
  paidCount,
  collected,
  outstanding,
}: {
  orderId: string;
  receipts: Receipt[];
  regrouped: RegroupedOrder;
  regroupedText: string;
  paidCount: number;
  collected: number;
  outstanding: number;
}) {
  const idBase = useTabsId();
  const [tab, setTab] = useState<Tab>("participants");
  const unpaid = receipts.length - paidCount;

  return (
    <div>
      <Tabs
        idBase={idBase}
        label="Order views"
        value={tab}
        onChange={setTab}
        items={[
          { value: "participants", label: `Participants (${receipts.length})` },
          { value: "regrouped", label: "Regrouped" },
          { value: "people", label: "By person" },
          { value: "payments", label: unpaid > 0 ? `Payments (${unpaid} unpaid)` : "Payments" },
        ]}
      />
      <TabPanel idBase={idBase} value={tab} className="pt-6">
        {receipts.length === 0 ? (
          <EmptyState title="No one has joined yet">Share the link above. People appear here as soon as they add an item.</EmptyState>
        ) : tab === "participants" ? (
          <Participants receipts={receipts} />
        ) : tab === "regrouped" ? (
          <Regrouped regrouped={regrouped} text={regroupedText} />
        ) : tab === "people" ? (
          <ByPerson orderId={orderId} receipts={receipts} />
        ) : (
          <Payments orderId={orderId} receipts={receipts} paidCount={paidCount} collected={collected} outstanding={outstanding} />
        )}
      </TabPanel>
    </div>
  );
}

/* ---------------- Participants ---------------- */

function Participants({ receipts }: { receipts: Receipt[] }) {
  const confirmed = receipts.filter((r) => r.confirmed).length;
  return (
    <div>
    <p className="mb-3 text-sm">
      <span className="num font-semibold">
        {confirmed} of {receipts.length}
      </span>{" "}
      <span className="text-ink-2">confirmed their order</span>
    </p>
    <div className="overflow-x-auto rounded-[var(--radius-box)] border border-line">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-wash text-ink-2">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">Name</th>
            <th scope="col" className="px-4 py-2.5 text-start font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">Items</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">Subtotal</th>
            <th scope="col" className="px-4 py-2.5 text-end font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {receipts.map((r) => (
            <tr key={r.participantId}>
              <td className="px-4 py-3 font-medium" dir="auto">{r.participantName}</td>
              <td className={cn("px-4 py-3 whitespace-nowrap", r.confirmed ? "font-medium text-accent" : "text-ink-3")}>
                {r.confirmed ? "Confirmed ✓" : "Still choosing"}
              </td>
              <td className="num px-4 py-3 text-end">{itemsOf(r)}</td>
              <td className="num px-4 py-3 text-end text-ink-2">{formatEGP(r.subtotal)}</td>
              <td className="num px-4 py-3 text-end font-medium">{formatEGP(r.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-line-strong">
          <tr>
            <th scope="row" className="px-4 py-3 text-start font-medium">Everyone</th>
            <td />
            <td className="num px-4 py-3 text-end">{receipts.reduce((n, r) => n + itemsOf(r), 0)}</td>
            <td className="num px-4 py-3 text-end text-ink-2">{formatEGP(receipts.reduce((n, r) => n + r.subtotal, 0))}</td>
            <td className="num px-4 py-3 text-end font-semibold">{formatEGP(receipts.reduce((n, r) => n + r.total, 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
  );
}

/* ---------------- Regrouped ---------------- */

function Regrouped({ regrouped, text }: { regrouped: RegroupedOrder; text: string }) {
  return (
    <div className="max-w-2xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">Everyone’s items combined, to send to the restaurant.</p>
        <CopyButton text={text} label="Copy as text" copiedLabel="Copied for WhatsApp" />
      </div>
      <div className="space-y-6">
        {regrouped.categories.map((cat) => (
          <section key={cat.id} aria-label={cat.name}>
            <h3 className="border-b border-ink pb-1.5 font-semibold" dir="auto">
              {cat.name}
            </h3>
            <ul className="divide-y divide-line">
              {cat.lines.map((l) => (
                <li key={`${l.itemId}-${l.variantId ?? ""}`} className="py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="num w-10 shrink-0 text-lg font-semibold">{l.totalQuantity}×</span>
                    <span className="min-w-0 flex-1 font-medium" dir="auto">
                      {l.name}
                    </span>
                    <span className="num shrink-0 text-sm text-ink-2">{formatEGP(l.unitPrice)}</span>
                    <span className="num w-24 shrink-0 text-end">{formatEGP(l.lineTotal)}</span>
                  </div>
                  {l.notes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 ps-13 text-sm text-ink-2">
                      {l.notes.map((n, i) => (
                        <li key={i} dir="auto">
                          <span className="font-medium text-ink">{n.participantName}:</span> {n.note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <dl className="mt-6 space-y-1.5 border-t border-ink pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-2">Items subtotal</dt>
          <dd className="num">{formatEGP(regrouped.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">Multiplier</dt>
          <dd className="num">{regrouped.multiplier === 1 ? "None" : `×${regrouped.multiplier.toFixed(2)}`}</dd>
        </div>
        {regrouped.fees > 0 ? (
          <div className="flex justify-between">
            <dt className="text-ink-2">Per-person fees (not sent to the restaurant)</dt>
            <dd className="num">{formatEGP(regrouped.fees)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between pt-1">
          <dt className="font-medium">Grand total</dt>
          <dd className="num text-xl font-semibold">{formatEGP(regrouped.grandTotal)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-3">Grand total is the sum of everyone’s rounded totals.</p>
    </div>
  );
}

/* ---------------- By person ---------------- */

type PendingRemove = { kind: "line"; lineId: string; label: string } | { kind: "person"; participantId: string; label: string };

function ByPerson({ orderId, receipts }: { orderId: string; receipts: Receipt[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<PendingRemove | null>(null);
  const [splitting, setSplitting] = useState<{ line: ReceiptLine; ownerId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirmRemove() {
    if (!removing) return;
    setError(null);
    start(async () => {
      const res =
        removing.kind === "line"
          ? await removeLineAdminAction(orderId, removing.lineId)
          : await removeParticipantAdminAction(orderId, removing.participantId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRemoving(null);
      router.refresh();
    });
  }

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2">
        {receipts.map((r) => (
          <li key={r.participantId} className="rounded-[var(--radius-box)] border border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold" dir="auto">
                {r.participantName}
                {r.confirmed ? <span className="ms-2 text-xs font-medium text-accent">Confirmed ✓</span> : null}
              </p>
              <a href={`tel:${r.participantPhone}`} className="num text-sm text-ink-2 underline-offset-4 hover:underline" dir="ltr">
                {r.participantPhone}
              </a>
            </div>
            <ul className="mt-3 space-y-2.5 border-t border-dashed border-line-strong pt-3 text-sm">
              {r.lines.map((l) => (
                <li key={l.lineId}>
                  <div className="flex items-baseline gap-2">
                    <span className="num shrink-0 text-ink-2">{l.quantity} ×</span>
                    <span className="min-w-0" dir="auto">
                      {l.name}
                    </span>
                    <span aria-hidden="true" className="leader" />
                    <span className="num shrink-0">{formatEGP(l.lineTotal)}</span>
                  </div>
                  {l.note ? (
                    <p className="ps-7 text-ink-2" dir="auto">
                      {l.note}
                    </p>
                  ) : null}
                  <ShareNote line={l} className="ps-7 text-xs text-accent" />
                  {l.isOwner ? (
                    <div className="mt-1 flex gap-1 ps-6">
                      <Button variant="ghost" size="sm" onClick={() => setSplitting({ line: l, ownerId: r.participantId })}>
                        {l.shareCount ? "Change split" : "Split"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger!"
                        onClick={() => setRemoving({ kind: "line", lineId: l.lineId, label: `${l.quantity} × ${l.name}` })}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="num">{formatEGP(r.subtotal)}</dd>
              </div>
              {r.multiplier !== 1 ? (
                <div className="flex justify-between">
                  <dt className="text-ink-2">Tax &amp; service (×{r.multiplier.toFixed(2)})</dt>
                  <dd className="num">{formatEGP(r.total - (r.fee ?? 0) - r.subtotal)}</dd>
                </div>
              ) : null}
              {r.fee ? (
                <div className="flex justify-between">
                  <dt className="text-ink-2">Fee</dt>
                  <dd className="num">{formatEGP(r.fee)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd className="num">{formatEGP(r.total)}</dd>
              </div>
            </dl>
            <div className="mt-3 border-t border-line pt-2 text-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-danger!"
                onClick={() => setRemoving({ kind: "person", participantId: r.participantId, label: r.participantName })}
              >
                Remove person
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => {
          setRemoving(null);
          setError(null);
        }}
        onConfirm={confirmRemove}
        title={removing?.kind === "person" ? `Remove ${removing.label}?` : "Remove this item?"}
        confirmLabel="Remove"
        tone="danger"
        pending={pending}
        error={error}
      >
        {removing?.kind === "person" ? (
          <p>All their items are removed from this order, and they’re taken off any item they were sharing.</p>
        ) : removing ? (
          <p dir="auto">{removing.label}</p>
        ) : null}
      </ConfirmDialog>

      {splitting ? (
        <SplitDialog
          key={splitting.line.lineId}
          orderId={orderId}
          line={splitting.line}
          ownerId={splitting.ownerId}
          people={receipts.map((r) => ({ id: r.participantId, name: r.participantName }))}
          onClose={() => setSplitting(null)}
        />
      ) : null}
    </>
  );
}

function SplitDialog({
  orderId,
  line,
  ownerId,
  people,
  onClose,
}: {
  orderId: string;
  line: ReceiptLine;
  ownerId: string;
  people: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set((line.sharedWithIds ?? []).filter((id) => id !== ownerId)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner = people.find((p) => p.id === ownerId);
  const others = people.filter((p) => p.id !== ownerId);
  const full = line.unitPrice * line.quantity;
  const payers = chosen.size + 1;

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await setLineSharingAction(orderId, line.lineId, [...chosen]);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Split the cost"
      description={
        <span dir="auto">
          {line.quantity} × {line.name} · <span className="num">{formatEGP(full)}</span>
        </span>
      }
      footer={
        <div className="space-y-2">
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <p className="text-sm text-ink-2">
            {payers > 1 ? (
              <>
                Each of <span className="num">{payers}</span> people pays about{" "}
                <span className="num font-medium text-ink">{formatEGP(Math.ceil(full / payers))}</span>
              </>
            ) : (
              <>Only {owner?.name ?? "the owner"} pays</>
            )}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button pending={pending} onClick={save}>
              Save split
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-2 text-sm text-ink-2" dir="auto">
        {owner?.name ?? "The owner"} shares it with:
      </p>
      {others.length === 0 ? (
        <p className="text-sm text-ink-2">No one else is in this order yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {others.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={chosen.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span dir="auto">{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/* ---------------- Payments ---------------- */

type Filter = "all" | "unpaid" | "paid";

function Payments({
  orderId,
  receipts,
  paidCount,
  collected,
  outstanding,
}: {
  orderId: string;
  receipts: Receipt[];
  paidCount: number;
  collected: number;
  outstanding: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [asking, setAsking] = useState<Receipt | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const shown = receipts.filter((r) => (filter === "all" ? true : filter === "paid" ? r.paid : !r.paid));
  const unpaid = receipts.filter((r) => !r.paid);
  const willCash = unpaid.filter((r) => r.paymentChoice === "cash");
  const willInstapay = unpaid.filter((r) => r.paymentChoice === "instapay");
  const notChosen = unpaid.length - willCash.length - willInstapay.length;

  function save(r: Receipt, method: PaymentMethod | null) {
    setAsking(null);
    setError(null);
    setBusyId(r.participantId);
    start(async () => {
      const res = await setPaymentAction(orderId, r.participantId, method);
      if (!res.ok) setError(`${r.participantName}: ${res.error}`);
      router.refresh();
      setBusyId(null);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm">
          <span className="num font-semibold">
            {paidCount} of {receipts.length} paid
          </span>
          <span className="text-ink-2"> · collected </span>
          <span className="num font-medium">{formatEGP(collected)}</span>
          <span className="text-ink-2"> · outstanding </span>
          <span className={cn("num font-medium", outstanding > 0 && "text-danger")}>{formatEGP(outstanding)}</span>
          {unpaid.length > 0 ? (
            <span className="mt-1 block text-ink-2">
              Still to pay: <span className="num">{willCash.length}</span> cash (
              <span className="num">{formatEGP(willCash.reduce((s, r) => s + r.total, 0))}</span>) ·{" "}
              <span className="num">{willInstapay.length}</span> InstaPay (
              <span className="num">{formatEGP(willInstapay.reduce((s, r) => s + r.total, 0))}</span>)
              {notChosen > 0 ? (
                <>
                  {" "}
                  · <span className="num">{notChosen}</span> haven’t chosen
                </>
              ) : null}
            </span>
          ) : null}
        </p>
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unpaid", label: "Unpaid" },
            { value: "paid", label: "Paid" },
          ]}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-[var(--radius-control)] bg-danger-wash px-3 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-ink-2">{filter === "paid" ? "Nobody has paid yet." : "Everyone has paid."}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-[var(--radius-box)] border border-line">
          {shown.map((r) => (
            <li key={r.participantId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1 basis-48">
                <p className="font-medium" dir="auto">
                  {r.participantName}
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm">
                  <a href={`tel:${r.participantPhone}`} className="num inline-flex min-h-9 items-center text-ink-2 underline-offset-4 hover:underline" dir="ltr">
                    {r.participantPhone}
                  </a>
                  <a
                    href={waLink(r.participantPhone)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-9 items-center font-medium text-accent underline-offset-4 hover:underline"
                  >
                    WhatsApp
                  </a>
                </p>
                {r.amountChangedSincePayment ? (
                  <Badge tone="warn" className="mt-1">
                    Amount changed since payment
                  </Badge>
                ) : null}
              </div>
              <div className="text-end">
                <p className="num font-semibold">{formatEGP(r.total)}</p>
                <p className="text-xs text-ink-2">
                  {r.paid
                    ? `Paid · ${r.paidMethod === "instapay" ? "InstaPay" : "Cash"}`
                    : r.paymentChoice
                      ? `Will pay ${r.paymentChoice === "instapay" ? "InstaPay" : "cash"}`
                      : "Not chosen yet"}
                </p>
              </div>
              <PaidSwitch
                checked={r.paid}
                busy={busyId === r.participantId}
                label={`${r.participantName} paid`}
                onChange={(on) => (on ? setAsking(r) : save(r, null))}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={asking !== null}
        onClose={() => setAsking(null)}
        title={asking ? `How did ${asking.participantName} pay?` : ""}
        description={asking ? <span className="num">{formatEGP(asking.total)}</span> : undefined}
      >
        <div className="grid grid-cols-2 gap-3 pb-2">
          <Button
            variant={asking?.paymentChoice === "cash" ? "primary" : "secondary"}
            size="lg"
            onClick={() => asking && save(asking, "cash")}
          >
            Cash
          </Button>
          <Button
            variant={asking?.paymentChoice === "instapay" ? "primary" : "secondary"}
            size="lg"
            onClick={() => asking && save(asking, "instapay")}
          >
            InstaPay
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function PaidSwitch({
  checked,
  busy,
  label,
  onChange,
}: {
  checked: boolean;
  busy: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius-control)] px-1 text-sm font-medium disabled:opacity-50"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors duration-150",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-paper shadow-sm transition-transform duration-150",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </span>
      <span className={cn("w-12 text-start", checked ? "text-accent" : "text-ink-2")}>{checked ? "Paid" : "Unpaid"}</span>
    </button>
  );
}
