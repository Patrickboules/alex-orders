import { formatEGP } from "@/lib/money";
import type { MenuItem } from "@/lib/types";

/** Lowest price of an item: its variants' cheapest, or its base price. */
export function itemFromPrice(item: MenuItem): { price: number; varies: boolean } {
  const variants = item.variants ?? [];
  if (variants.length === 0) return { price: item.price, varies: false };
  const prices = variants.map((v) => v.price);
  const min = Math.min(...prices);
  return { price: min, varies: prices.some((p) => p !== min) };
}

export function Price({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`num whitespace-nowrap ${className}`}>{formatEGP(value)}</span>;
}
