import type { ReceiptLine } from "@/components/view-types";

/** "Split ÷3 with Mona, Karim" under a shared receipt line. */
export function ShareNote({ line, className }: { line: ReceiptLine; className?: string }) {
  if (!line.shareCount) return null;
  const others = line.sharedWithNames?.join(", ");
  return (
    <p className={className ?? "mt-0.5 ps-8 text-xs text-accent"} dir="auto">
      {line.isOwner ? "Split" : "Shared"} ÷{line.shareCount}
      {others ? ` with ${others}` : null}
    </p>
  );
}
