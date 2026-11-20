import "server-only";
import { headers } from "next/headers";

// Simple fixed-window, in-memory limiter (per server instance). Good enough to stop
// casual spam on join / add-line; not a security boundary.
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Returns true if allowed. */
export async function rateLimit(scope: string, limit = 30): Promise<boolean> {
  const key = `${scope}:${await clientIp()}`;
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  b.count++;
  return b.count <= limit;
}
