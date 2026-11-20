"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-fetches the page's server data every `seconds` while the tab is visible. */
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      router.refresh();
      setUpdatedAt(new Date());
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(tick, seconds * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        tick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, seconds]);

  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-3">
      <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
      Live, updates every {seconds} s
      {updatedAt ? (
        <span className="sr-only">
          , last updated {updatedAt.toLocaleTimeString("en-GB")}
        </span>
      ) : null}
    </p>
  );
}
