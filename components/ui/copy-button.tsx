"use client";

import { useEffect, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/** Copies `text` to the clipboard and confirms in place for two seconds. */
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "secondary",
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  "aria-label"?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = setTimeout(() => setState("idle"), 2000);
    return () => clearTimeout(t);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Button variant={variant} size={size} onClick={copy} className={className} aria-label={ariaLabel}>
      <span aria-live="polite">
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : label}
      </span>
    </Button>
  );
}
