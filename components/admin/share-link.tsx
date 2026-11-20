import { CopyButton } from "@/components/ui/copy-button";

/** Share link for an order: the URL, a copy button and a QR code (SVG made on the server). */
export function ShareLink({ url, qrSvg }: { url: string; qrSvg: string | null }) {
  return (
    <div className="flex gap-4 rounded-[var(--radius-box)] border border-line p-4">
      {qrSvg ? (
        <div
          role="img"
          aria-label="QR code of the order link"
          className="size-28 shrink-0 [&_svg]:size-full"
          // Generated locally by the qrcode package from our own URL.
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Share this link</p>
          <p className="mt-0.5 truncate text-sm text-ink-2" dir="ltr">
            {url.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <CopyButton text={url} label="Copy link" copiedLabel="Link copied" variant="primary" size="md" className="self-start" />
      </div>
    </div>
  );
}
