"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, FormError, Input } from "@/components/ui/input";
import { TabPanel, Tabs, useTabsId } from "@/components/ui/tabs";

type Kind = "images" | "pdf" | "link";

const MAX_IMAGES = 10;
const MAX_IMAGE_MB = 10;
const MAX_PDF_MB = 20;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const IMAGE_RE = /\.(jpe?g|png|webp|heic|heif)$/i;

type PageResult = { page: number; ok: boolean; error?: string };
type ParseResponse = { ok: true; pages: PageResult[]; itemCount: number } | { ok: false; error: string; pages?: PageResult[] };

function isImage(f: File) {
  return /^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || IMAGE_RE.test(f.name);
}

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MenuUpload({ restaurantId, onCancel }: { restaurantId: string; onCancel?: () => void }) {
  const router = useRouter();
  const idBase = useTabsId();
  const [kind, setKind] = useState<Kind>("images");
  const [images, setImages] = useState<File[]>([]);
  const [pdf, setPdf] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [failedPages, setFailedPages] = useState<PageResult[]>([]);
  const [parsing, setParsing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!parsing) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [parsing]);

  function addImages(list: FileList | File[]) {
    const incoming = Array.from(list);
    const problems: string[] = [];
    const ok: File[] = [];
    for (const f of incoming) {
      if (!isImage(f)) problems.push(`“${f.name}” isn’t a JPG, PNG, WEBP or HEIC image.`);
      else if (f.size > MAX_IMAGE_MB * 1024 * 1024) problems.push(`“${f.name}” is ${mb(f.size)}. Photos can be up to ${MAX_IMAGE_MB} MB.`);
      else ok.push(f);
    }
    const next = [...images, ...ok];
    if (next.length > MAX_IMAGES) {
      problems.push(`You can upload up to ${MAX_IMAGES} photos. The last ${next.length - MAX_IMAGES} were left out.`);
    }
    setImages(next.slice(0, MAX_IMAGES));
    setErrors(problems);
  }

  function choosePdf(f: File | undefined) {
    if (!f) return;
    if (!(f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
      setErrors([`“${f.name}” isn’t a PDF.`]);
      return;
    }
    if (f.size > MAX_PDF_MB * 1024 * 1024) {
      setErrors([`“${f.name}” is ${mb(f.size)}. PDFs can be up to ${MAX_PDF_MB} MB.`]);
      return;
    }
    setErrors([]);
    setPdf(f);
  }

  const ready = kind === "images" ? images.length > 0 : kind === "pdf" ? pdf !== null : /^https?:\/\/\S+/i.test(url.trim());

  async function submit() {
    if (!ready) return;
    setServerError(null);
    setFailedPages([]);
    const body = new FormData();
    body.set("restaurantId", restaurantId);
    body.set("kind", kind);
    if (kind === "images") images.forEach((f) => body.append("files", f, f.name));
    if (kind === "pdf" && pdf) body.append("files", pdf, pdf.name);
    if (kind === "link") body.set("url", url.trim());

    setElapsed(0);
    setParsing(true);
    try {
      const res = await fetch("/api/parse", { method: "POST", body });
      const data = (await res.json().catch(() => null)) as ParseResponse | null;
      if (!data) {
        setServerError(res.status === 401 ? "Your session ended. Log in again." : `Upload failed (${res.status}). Try again.`);
        return;
      }
      if (!data.ok) {
        setServerError(data.error);
        setFailedPages((data.pages ?? []).filter((p) => !p.ok));
        return;
      }
      const failed = data.pages.filter((p) => !p.ok);
      if (failed.length > 0) {
        // The editor shows which pages could not be read.
        sessionStorageSafeSet(`parse-warning-${restaurantId}`, JSON.stringify(failed));
      }
      router.refresh();
      onCancel?.();
    } catch {
      setServerError("The upload didn’t reach the server. Check your connection and try again.");
    } finally {
      setParsing(false);
    }
  }

  if (parsing) {
    const what =
      kind === "images" ? `${images.length} ${images.length === 1 ? "photo" : "photos"}` : kind === "pdf" ? "the PDF" : "the link";
    return (
      <div role="status" aria-live="polite" className="rounded-[var(--radius-box)] border border-line p-6 sm:p-8">
        <p className="text-lg font-semibold">Parsing menu…</p>
        <p className="mt-1 text-sm text-ink-2">
          Reading {what}. A few pages usually take under a minute; keep this tab open.
        </p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-wash-2" aria-hidden="true">
          <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-accent motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
        </div>
        <p className="num mt-3 text-sm text-ink-3">{elapsed} s</p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-box)] border border-line p-4 sm:p-6">
      <Tabs
        idBase={idBase}
        label="Menu source"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setErrors([]);
          setServerError(null);
        }}
        items={[
          { value: "images", label: "Photos" },
          { value: "pdf", label: "PDF" },
          { value: "link", label: "Link" },
        ]}
      />

      <TabPanel idBase={idBase} value={kind} className="pt-5">
        {kind === "images" ? (
          <ImagePicker images={images} onAdd={addImages} onRemove={(i) => setImages(images.filter((_, j) => j !== i))} />
        ) : kind === "pdf" ? (
          <PdfPicker pdf={pdf} onChoose={choosePdf} onClear={() => setPdf(null)} />
        ) : (
          <Field id="menu-url" label="Menu link" help="A restaurant page, or a direct link to a menu image or PDF.">
            <Input
              id="menu-url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              dir="ltr"
              aria-describedby="menu-url-help"
            />
          </Field>
        )}
      </TabPanel>

      {errors.length > 0 ? (
        <ul role="alert" className="mt-4 space-y-1 rounded-[var(--radius-control)] bg-danger-wash px-3 py-2.5 text-sm text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4">
        <FormError>{serverError}</FormError>
        {failedPages.length > 0 ? (
          <p className="mt-2 text-sm text-ink-2">
            Couldn’t read {failedPages.map((p) => `page ${p.page}`).join(", ")}.
          </p>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={submit} disabled={!ready}>
          Read menu
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function sessionStorageSafeSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage may be unavailable; the warning is a convenience.
  }
}

function ImagePicker({
  images,
  onAdd,
  onRemove,
}: {
  images: File[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (index: number) => void;
}) {
  const [over, setOver] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const urls = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  const previous = useRef<string[]>([]);

  // Free preview URLs that are no longer shown (safe to run twice in StrictMode).
  useEffect(() => {
    const old = previous.current;
    previous.current = urls;
    old.filter((u) => !urls.includes(u)).forEach((u) => URL.revokeObjectURL(u));
  }, [urls]);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) onAdd(e.dataTransfer.files);
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-box)] border border-dashed px-4 py-8 text-center transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
          over ? "border-accent bg-accent-wash" : "border-line-strong hover:bg-wash",
        )}
      >
        <span className="font-medium">Drop menu photos here, or choose files</span>
        <span className="mt-1 text-sm text-ink-2">
          Up to {MAX_IMAGES} photos, {MAX_IMAGE_MB} MB each. JPG, PNG, WEBP or HEIC.
        </span>
        <input
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <div className="mt-3 sm:hidden">
        <Button variant="secondary" className="w-full" onClick={() => camera.current?.click()}>
          Take a photo
        </Button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            if (e.target.files) onAdd(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {images.length > 0 ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {images.map((f, i) => (
            <li key={`${f.name}-${i}`} className="group relative">
              <div className="aspect-[3/4] overflow-hidden rounded-[var(--radius-control)] border border-line bg-wash">
                {urls[i] ? (
                  // Local object-URL previews; next/image can't optimise these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[i]} alt={f.name} className="size-full object-cover" />
                ) : null}
              </div>
              <p className="num mt-1 truncate text-xs text-ink-2">
                {i + 1}. {f.name}
              </p>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${f.name}`}
                className="absolute end-1 top-1 grid size-8 place-items-center rounded-full bg-paper/90 text-ink shadow-sm hover:bg-paper"
              >
                <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden="true">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PdfPicker({ pdf, onChoose, onClear }: { pdf: File | null; onChoose: (f: File | undefined) => void; onClear: () => void }) {
  if (pdf) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-box)] border border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{pdf.name}</p>
          <p className="num text-sm text-ink-2">{mb(pdf.size)}</p>
        </div>
        <Button variant="ghost" onClick={onClear}>
          Remove
        </Button>
      </div>
    );
  }
  return (
    <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[var(--radius-box)] border border-dashed border-line-strong px-4 py-8 text-center transition-colors duration-150 hover:bg-wash has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent">
      <span className="font-medium">Choose a PDF menu</span>
      <span className="mt-1 text-sm text-ink-2">One file, up to {MAX_PDF_MB} MB and 15 pages.</span>
      <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => onChoose(e.target.files?.[0])} />
    </label>
  );
}
